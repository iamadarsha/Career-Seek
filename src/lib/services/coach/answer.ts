/**
 * Grounded Answer Service - Phase F
 *
 * RAG pipeline: retrieve → inject context → generate → cite sources.
 * Produces structured answers with confidence levels and source references.
 */

import { z } from 'zod';
import { getAIRuntimeEnv, getAppConfig } from '../../config';
import { getAIManager } from '../../ai/manager';
import { findQuestionBankAnswer, getContextualQuestionSuggestions } from './question-bank';
import { discoverAIProviderConfigs } from '../../ai/providers';
import { retrieve, RetrievalScope, RetrievedChunk } from './retriever';
import { logger } from '../../logger';

// ── Types ──────────────────────────────────────────────────────────────────

export const GroundedAnswerSchema = z.object({
  answer: z.string(),
  confidenceLevel: z.enum(['high', 'medium', 'low']),
  reasoning: z.string().optional(),
  sourceReferences: z.array(z.object({
    chunkIndex: z.number(),
    relevance: z.string(), // brief explanation of why this source was used
  })),
  suggestedFollowUps: z.array(z.string()).optional(),
  caveats: z.array(z.string()).optional(),
});

export type GroundedAnswer = z.infer<typeof GroundedAnswerSchema>;

export interface CoachResponse {
  answer: GroundedAnswer;
  sources: RetrievedChunk[];
  retrievalTimeMs: number;
  generationTimeMs: number;
}

type ConfidenceLevel = GroundedAnswer['confidenceLevel'];

const CAREER_INTENT = /\b(job|role|resume|cv|cover letter|interview|apply|application|salary|recruiter|hiring|jd|description|ats|skill|career|company|follow.?up|outreach|profile|pipeline|saved|applied|fit|match|risk|gap|strength|weak|background|prepare|screen|offer|keyword|project|experience|manager|next)\b/i;
const CONFIDENCE_RANK: Record<ConfidenceLevel, number> = { low: 0, medium: 1, high: 2 };
const RANK_TO_CONFIDENCE: ConfidenceLevel[] = ['low', 'medium', 'high'];

function safeGenerationErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error ?? 'Unknown generation error');
  return raw
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[redacted-api-key]')
    .replace(/sk-[0-9A-Za-z_-]{20,}/g, '[redacted-api-key]')
    .replace(/([?&](?:key|api_key)=)[^&\s]+/gi, '$1[redacted]')
    .slice(0, 300);
}

function ollamaRootUrl(baseUrl: string | undefined) {
  return (baseUrl || 'http://127.0.0.1:11434/v1').replace(/\/+$/, '').replace(/\/v1$/, '');
}

async function isOllamaReachable(runtimeEnv: Record<string, string | undefined>) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 750);

  try {
    const response = await fetch(`${ollamaRootUrl(runtimeEnv.OLLAMA_BASE_URL)}/api/tags`, {
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function getGenerationRuntime() {
  const runtimeEnv = getAIRuntimeEnv(getAppConfig());
  const providers = discoverAIProviderConfigs(runtimeEnv).filter((provider) => provider.enabled);
  const hasNonLocalProvider = providers.some((provider) => provider.providerKind !== 'local');
  const hasOllamaProvider = providers.some((provider) => provider.provider === 'ollama');
  const hasReachableOllama = hasOllamaProvider ? await isOllamaReachable(runtimeEnv) : false;

  return {
    runtimeEnv,
    hasGenerationProvider: hasNonLocalProvider || hasReachableOllama,
  };
}

function hasCareerIntent(
  question: string,
  scoredJobId: number | null,
  conversationHistory: Array<{ role: string; content: string }>,
): boolean {
  return CAREER_INTENT.test(question) ||
    Boolean(scoredJobId) ||
    conversationHistory.slice(-4).some((message) => CAREER_INTENT.test(message.content));
}

function evidenceConfidence(sources: RetrievedChunk[], question = ''): ConfidenceLevel {
  if (sources.length === 0) return 'low';
  const topScore = sources[0]?.relevanceScore || 0;
  const topThree = sources.slice(0, 3);
  const averageScore = topThree.reduce((sum, source) => sum + source.relevanceScore, 0) / topThree.length;
  const sourceTypes = new Set(topThree.map((source) => source.sourceType));
  const hasJobEvidence = sources.some((source) => ['job_description', 'jd_analysis', 'enrichment'].includes(source.sourceType));
  const hasCandidateEvidence = sources.some((source) => ['master_profile', 'resume_text', 'tailored_resume', 'ats_report'].includes(source.sourceType));
  const hasAtsEvidence = sources.some((source) => source.sourceType === 'ats_report');
  const hasThinMarketDomain = /\b(ux|ui|designer|design|portfolio|case study|figma|wireframe|prototype|research|usability|aml|kyc|compliance|financial crime|transaction monitoring|sanctions|regulatory)\b/i.test(question);
  const hasEvidenceSynthesisIntent = /\b(background|best matches?|matches this role|ats gaps?|missing keywords?|strengthen|resume bullets?|which evidence|emphasize|case study should|lead with)\b/i.test(question);

  if (topScore >= 58 && averageScore >= 45 && sourceTypes.size >= 2) return 'high';
  if (topScore >= 30 || averageScore >= 25) return 'medium';
  if (hasThinMarketDomain && hasJobEvidence && hasCandidateEvidence && sources.length >= 2) return 'medium';
  if (hasEvidenceSynthesisIntent && hasCandidateEvidence && (hasJobEvidence || hasAtsEvidence) && sources.length >= 2) return 'medium';
  return 'low';
}

function clampConfidence(modelConfidence: ConfidenceLevel, sources: RetrievedChunk[], question = ''): ConfidenceLevel {
  const evidenceLevel = evidenceConfidence(sources, question);
  return RANK_TO_CONFIDENCE[Math.min(CONFIDENCE_RANK[modelConfidence], CONFIDENCE_RANK[evidenceLevel])];
}

function cleanStringList(value: unknown, fallback: string[], maxItems = 3): string[] {
  const raw = Array.isArray(value) ? value : fallback;
  return raw
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

function summarizeChunk(content: string, maxLength = 280): string {
  const compact = content.replace(/\s+/g, ' ').trim();
  return compact.length > maxLength ? `${compact.slice(0, maxLength - 3)}...` : compact;
}

function normalizeSourceReferences(
  rawReferences: unknown,
  sources: RetrievedChunk[],
  answerText: string,
): GroundedAnswer['sourceReferences'] {
  const seen = new Set<number>();
  const valid: GroundedAnswer['sourceReferences'] = [];

  if (Array.isArray(rawReferences)) {
    for (const ref of rawReferences) {
      const index = Number((ref as any)?.chunkIndex);
      if (!Number.isInteger(index) || index < 1 || index > sources.length || seen.has(index)) continue;
      seen.add(index);
      valid.push({
        chunkIndex: index,
        relevance: typeof (ref as any)?.relevance === 'string' && (ref as any).relevance.trim()
          ? (ref as any).relevance.trim()
          : `${sources[index - 1].sourceLabel} was used as local evidence.`,
      });
    }
  }

  if (valid.length > 0) return valid.slice(0, 4);

  const citedInText = sources
    .map((source, idx) => ({ source, index: idx + 1 }))
    .filter(({ index }) => new RegExp(`\\bSource\\s*${index}\\b|\\[${index}\\]`, 'i').test(answerText))
    .slice(0, 4)
    .map(({ source, index }) => ({
      chunkIndex: index,
      relevance: `${source.sourceLabel} was cited in the answer.`,
    }));
  if (citedInText.length > 0) return citedInText;

  return sources.slice(0, Math.min(3, sources.length)).map((source, idx) => ({
    chunkIndex: idx + 1,
    relevance: `${source.sourceLabel} matched the question with ${source.relevanceScore}% relevance.`,
  }));
}

function defaultFollowUps(question: string, sources: RetrievedChunk[]): string[] {
  const q = question.toLowerCase();
  const hasJobEvidence = sources.some((source) => source.scoredJobId && ['job_description', 'jd_analysis', 'enrichment'].includes(source.sourceType));
  const hasResumeEvidence = sources.some((source) => ['master_profile', 'resume_text', 'tailored_resume', 'ats_report'].includes(source.sourceType));
  const prompts: string[] = [];

  if (hasJobEvidence && hasResumeEvidence) {
    prompts.push('Which evidence should I emphasize first?', 'What are the biggest gaps for this role?');
  } else if (hasJobEvidence) {
    prompts.push('What does this JD seem to prioritize?', 'What interview questions should I prepare?');
  } else {
    prompts.push('What local materials should I index next?', 'Which profile points are strongest?');
  }

  if (/\b(resume|cv|ats|keyword|skill)\b/.test(q)) {
    prompts.push('Which resume bullets should I change?');
  } else if (/\b(interview|prepare|screen)\b/.test(q)) {
    prompts.push('Which stories should I prepare?');
  } else {
    prompts.push('What should I do next?');
  }

  return prompts.slice(0, 3);
}

function ensureLowConfidenceHonesty(answer: string, confidenceLevel: ConfidenceLevel): string {
  if (confidenceLevel !== 'low') return answer;
  if (/\b(limited|not enough|insufficient|cannot|can't|do not have|don't have)\b/i.test(answer)) return answer;
  return `I have limited local evidence for this, so treat this as a cautious read.\n\n${answer}`;
}

function ensureAnswerCitesSources(answer: string, sourceReferences: GroundedAnswer['sourceReferences']): string {
  if (sourceReferences.length === 0) return answer;
  const citesSource = sourceReferences.some((ref) =>
    new RegExp(`\\bSource\\s*${ref.chunkIndex}\\b|\\[${ref.chunkIndex}\\]`, 'i').test(answer)
  );
  if (citesSource) return answer;
  return `${answer}\n\nSources used: ${sourceReferences.map((ref) => `Source ${ref.chunkIndex}`).join(', ')}.`;
}

function normalizeGroundedAnswer(
  parsed: any,
  sources: RetrievedChunk[],
  question: string,
): GroundedAnswer {
  const fallbackAnswer = sources.length > 0
    ? `Based on the strongest local sources, the safest read is:\n\n${sources.slice(0, 3).map((source, idx) => `- Source ${idx + 1}: ${summarizeChunk(source.content, 180)}`).join('\n')}`
    : 'I do not have enough local evidence to answer this safely.';
  const modelConfidence: ConfidenceLevel = ['high', 'medium', 'low'].includes(parsed?.confidenceLevel)
    ? parsed.confidenceLevel
    : evidenceConfidence(sources, question);
  const confidenceLevel = clampConfidence(modelConfidence, sources, question);
  const sourceReferences = normalizeSourceReferences(parsed?.sourceReferences, sources, parsed?.answer || fallbackAnswer);
  const caveats = cleanStringList(parsed?.caveats, [], 4);

  if (confidenceLevel === 'low' && !caveats.some((caveat) => /limited|thin|insufficient|not enough/i.test(caveat))) {
    caveats.unshift('Local evidence was limited or weakly matched, so this answer should be treated as a starting point.');
  }

  const answerText = typeof parsed?.answer === 'string' && parsed.answer.trim() ? parsed.answer.trim() : fallbackAnswer;
  const normalized = {
    answer: ensureLowConfidenceHonesty(
      ensureAnswerCitesSources(answerText, sourceReferences),
      confidenceLevel,
    ),
    confidenceLevel,
    reasoning: typeof parsed?.reasoning === 'string' ? parsed.reasoning.trim() : undefined,
    sourceReferences,
    suggestedFollowUps: cleanStringList(parsed?.suggestedFollowUps, defaultFollowUps(question, sources), 3),
    caveats,
  };

  return GroundedAnswerSchema.parse(normalized);
}

function buildExtractiveFallback(
  question: string,
  sources: RetrievedChunk[],
  reason: string,
): GroundedAnswer {
  const evidenceLines = sources.slice(0, 4).map((source, idx) =>
    `- Source ${idx + 1} (${source.sourceLabel}): ${summarizeChunk(source.content)}`
  );

  return {
    answer: [
      'I could not produce a full generated coaching answer, so I am staying close to the local evidence.',
      '',
      evidenceLines.join('\n'),
      '',
      'Ask a narrower follow-up about fit, risks, resume keywords, outreach, or interview prep and I can try again against these sources.',
    ].join('\n'),
    confidenceLevel: 'low',
    reasoning: `Generation fallback used because: ${reason}`,
    sourceReferences: normalizeSourceReferences([], sources, evidenceLines.join('\n')),
    suggestedFollowUps: defaultFollowUps(question, sources),
    caveats: ['The generative answer failed; this is an evidence summary, not a full coaching judgment.'],
  };
}

function buildPlaybookFallback(
  question: string,
  sources: RetrievedChunk[],
  reason: string,
): GroundedAnswer | null {
  const playbookEntry = findQuestionBankAnswer(question);
  if (!playbookEntry) return null;

  const evidenceLines = sources.slice(0, 3).map((source, idx) =>
    `- Source ${idx + 1} (${source.sourceLabel}): ${summarizeChunk(source.content, 220)}`
  );
  const sourceReferences = normalizeSourceReferences([], sources, playbookEntry.answer);

  return {
    answer: [
      'Local coach playbook answer:',
      '',
      playbookEntry.answer,
      evidenceLines.length > 0 ? '\nLocal evidence to cross-check:\n' + evidenceLines.join('\n') : '',
    ].filter(Boolean).join('\n'),
    confidenceLevel: evidenceLines.length > 0 ? 'medium' : 'low',
    reasoning: `Matched local playbook entry "${playbookEntry.id}". ${reason}`,
    sourceReferences,
    suggestedFollowUps: playbookEntry.suggestedFollowUps,
    caveats: [
      ...playbookEntry.caveats,
      reason,
    ].slice(0, 4),
  };
}

function buildDomainGeneralGuidance(question: string, reason: string): GroundedAnswer | null {
  if (/\b(ux|ui|designer|design|portfolio|case study|figma|wireframe|prototype|research|usability)\b/i.test(question)) {
    return {
      answer: [
        'I do not have enough job-specific local evidence for a confident role-by-role answer yet, so this is general UX career guidance rather than a claim about a specific posting.',
        '',
        '- Lead with one or two portfolio case studies that show the problem, constraints, research signal, design decisions, and measurable outcome.',
        '- Keep Figma, prototyping, interaction design, usability testing, stakeholder collaboration, and design-system vocabulary visible when those are true for your background.',
        '- For junior UX roles, prioritize evidence of process clarity: how you understood users, explored alternatives, tested assumptions, and improved the design.',
      ].join('\n'),
      confidenceLevel: 'low',
      reasoning: reason,
      sourceReferences: [],
      suggestedFollowUps: ['Which UX portfolio case study should I lead with?', 'What UX keywords should I prove with evidence?', 'How should I rewrite my top UX bullet?'],
      caveats: ['General advice only; index a target job description and resume evidence for job-specific coaching.'],
    };
  }

  return null;
}

// ── Answer generation ──────────────────────────────────────────────────────

export async function generateGroundedAnswer(
  question: string,
  scope: RetrievalScope,
  scoredJobId: number | null,
  conversationHistory: Array<{ role: string; content: string }> = [],
  answerMode: 'concise' | 'detailed' = 'concise',
): Promise<CoachResponse> {
  if (!hasCareerIntent(question, scoredJobId, conversationHistory)) {
    return {
      answer: {
        answer: 'I can help with your job search, resume, applications, interviews, and the jobs saved in Career Seek. I do not have enough relevant career context to answer that question here.',
        confidenceLevel: 'low',
        sourceReferences: [],
        suggestedFollowUps: ['Which saved job should we discuss?', 'How should I improve my resume for a target JD?'],
        caveats: ['Question was outside the Career Seek coaching scope.'],
      },
      sources: [],
      retrievalTimeMs: 0,
      generationTimeMs: 0,
    };
  }

  // 1. Retrieve relevant evidence
  const topK = answerMode === 'detailed' ? 12 : 8;
  const retrieval = await retrieve(question, scope, scoredJobId, topK);
  if (retrieval.chunks.length === 0) {
    const playbookFallback = buildPlaybookFallback(
      question,
      [],
      'No indexed local evidence was retrieved, so this response uses the offline coach playbook.',
    );
    if (playbookFallback) {
      return {
        answer: playbookFallback,
        sources: [],
        retrievalTimeMs: retrieval.retrievalTimeMs,
        generationTimeMs: 0,
      };
    }

    const domainGuidance = buildDomainGeneralGuidance(
      question,
      'No indexed local evidence was retrieved, so the Coach used clearly labeled general domain guidance.',
    );
    if (domainGuidance) {
      return {
        answer: domainGuidance,
        sources: [],
        retrievalTimeMs: retrieval.retrievalTimeMs,
        generationTimeMs: 0,
      };
    }

    const target = scoredJobId ? 'the selected job' : 'your profile';
    return {
      answer: {
        answer: `I do not have enough indexed evidence about ${target} to answer that safely yet. Index your profile and job materials, generate a JD analysis or resume asset if this is a role-specific question, then ask again.`,
        confidenceLevel: 'low',
        sourceReferences: [],
        suggestedFollowUps: scoredJobId
          ? ['Index this job and my profile', 'Generate a JD analysis first', 'Which materials are missing?']
          : ['Index my profile', 'Which materials are missing?', 'What can I ask after indexing?'],
        caveats: ['No sufficiently relevant sources were retrieved.'],
      },
      sources: [],
      retrievalTimeMs: retrieval.retrievalTimeMs,
      generationTimeMs: 0,
    };
  }

  const genStart = Date.now();

  // 2. Build grounded context
  const evidenceBlock = retrieval.chunks
    .map((chunk, idx) => 
      `[Source ${idx + 1}] (${chunk.sourceLabel}, relevance ${chunk.relevanceScore}%)\n${chunk.content}`
    )
    .join('\n\n---\n\n');

  // 3. Build conversation context (last 4 messages max)
  const recentHistory = conversationHistory.slice(-4);
  const historyBlock = recentHistory.length > 0
    ? `\nRecent conversation before this turn:\n${recentHistory.map(m => `${m.role}: ${m.content}`).join('\n')}\n`
    : '';

  // 4. Construct prompt
  const modeInstruction = answerMode === 'detailed'
    ? 'Provide a thorough, detailed answer with specific examples from the sources.'
    : 'Provide a concise, actionable answer. Be direct and specific.';

  const systemPrompt = `
You are an expert career coach and interview preparation advisor.
You are helping a user with their job search strategy, resume optimization, and interview preparation.

${modeInstruction}

CRITICAL RULES:
1. ONLY use information from the provided source materials below. Do NOT fabricate facts.
2. If the sources don't contain enough information to answer the question, say so honestly and set confidenceLevel to "low".
3. Clearly distinguish between facts from sources and your professional interpretation.
4. Reference specific source numbers when making claims (e.g., "Based on Source 1...").
5. For interview questions, ground them in the actual job requirements and the user's experience.
6. Never invent skills, experiences, or achievements the user doesn't have.
7. Be respectful, practical, and confident without overclaiming.
8. Always populate sourceReferences with the source numbers you relied on. Use only source numbers from SOURCE MATERIALS.
9. If local evidence is thin, say that plainly at the start and set confidenceLevel to "low".
10. Do not claim an application was submitted, a message was sent, or a document was regenerated unless a source explicitly says so.
11. For broad UX/design career questions with sparse local evidence, you may add a clearly labeled "General advice" section, but do not present it as job-specific or source-backed.
`;

  const prompt = `
SOURCE MATERIALS:
${evidenceBlock || '(No relevant sources found)'}
${historyBlock}

USER QUESTION: ${question}

Respond with a STRICT JSON object matching this schema:
{
  "answer": "string (the main response, using markdown formatting for readability)",
  "confidenceLevel": "high" | "medium" | "low",
  "reasoning": "optional string - brief explanation of how you arrived at this answer",
  "sourceReferences": [
    { "chunkIndex": number (1-based source index), "relevance": "string (why this source was used)" }
  ],
  "suggestedFollowUps": ["string (2-3 natural follow-up questions the user might ask)"],
  "caveats": ["string (any important caveats or limitations of this answer)"]
}
`;

  const { runtimeEnv, hasGenerationProvider } = await getGenerationRuntime();
  if (!hasGenerationProvider) {
    const playbookFallback = buildPlaybookFallback(
      question,
      retrieval.chunks,
      'No AI provider is configured, so the Coach used the offline playbook with retrieved local evidence.',
    );
    if (playbookFallback) {
      return {
        answer: playbookFallback,
        sources: retrieval.chunks,
        retrievalTimeMs: retrieval.retrievalTimeMs,
        generationTimeMs: Date.now() - genStart,
      };
    }

    return {
      answer: buildExtractiveFallback(question, retrieval.chunks, 'No AI provider is configured, so the Coach stayed in evidence-only mode.'),
      sources: retrieval.chunks,
      retrievalTimeMs: retrieval.retrievalTimeMs,
      generationTimeMs: Date.now() - genStart,
    };
  }

  try {
    const response = await getAIManager({ env: runtimeEnv }).generate<any>({
      systemPrompt,
      userPrompt: prompt,
      temperature: 0.2,
      maxTokens: answerMode === 'detailed' ? 1800 : 1100,
      responseFormat: 'json',
      metadata: {
        task: 'coach_answer',
        scope,
        scoredJobId,
        sourceCount: retrieval.chunks.length,
      },
    });

    const parsed = response.parsed ?? {};
    const validated = normalizeGroundedAnswer(parsed, retrieval.chunks, question);

    return {
      answer: validated,
      sources: retrieval.chunks,
      retrievalTimeMs: retrieval.retrievalTimeMs,
      generationTimeMs: Date.now() - genStart,
    };
  } catch (error: any) {
    const safeMessage = safeGenerationErrorMessage(error);
    logger.error({ error: safeMessage }, 'Grounded answer generation failed');
    const playbookFallback = buildPlaybookFallback(question, retrieval.chunks, safeMessage);
    if (playbookFallback) {
      return {
        answer: playbookFallback,
        sources: retrieval.chunks,
        retrievalTimeMs: retrieval.retrievalTimeMs,
        generationTimeMs: Date.now() - genStart,
      };
    }
    
    return {
      answer: buildExtractiveFallback(question, retrieval.chunks, safeMessage),
      sources: retrieval.chunks,
      retrievalTimeMs: retrieval.retrievalTimeMs,
      generationTimeMs: Date.now() - genStart,
    };
  }
}

// ── Suggested prompt generator ─────────────────────────────────────────────

export function getSuggestedPrompts(options: {
  hasJob: boolean;
  hasResume: boolean;
  hasAtsReport: boolean;
}): string[] {
  const prompts: string[] = [];

  if (options.hasJob) {
    prompts.push(
      'How does my background fit this role?',
      'What are the biggest risks in my application?',
      'What interview questions should I prepare for?',
      'What are the strongest signals in this JD?',
    );
  }

  if (options.hasResume) {
    prompts.push(
      'Which projects should I emphasize?',
      'How should I explain my career trajectory?',
    );
  }

  if (options.hasAtsReport) {
    prompts.push(
      'Which ATS keywords am I still weak on?',
      'Should I regenerate my resume?',
    );
  }

  if (options.hasJob) {
    prompts.push(
      'How should I message the hiring manager?',
      'What salary range should I target?',
      'Should I apply for this role?',
    );
  }

  if (!options.hasJob) {
    prompts.push(
      'What are my strongest professional angles?',
      'What skills should I develop next?',
      'How should I position myself in the market?',
    );
  }

  return Array.from(new Set([
    ...prompts,
    ...getContextualQuestionSuggestions(options, 8),
  ])).slice(0, 8);
}
