/**
 * Model-agnostic Coach RAG engine.
 *
 * Local-first flow:
 * 1. Embed the question locally.
 * 2. Retrieve local evidence chunks.
 * 3. Generate through the user's configured AI provider when available.
 * 4. Fall back to an extractive evidence summary with citations.
 */

import { getAIManager } from '../../ai/manager';
import { discoverAIProviderConfigs } from '../../ai/providers';
import type { AIProviderConfig, AIProviderName } from '../../ai/types';
import { getAIRuntimeEnv, getAppConfig, type AppConfig } from '../../config';
import { embedCoachTexts } from './embedder';
import { retrieve, type RetrievedChunk, type RetrievalScope } from './retriever';
import { z } from 'zod';

export type CoachRagAnswerMode = 'concise' | 'detailed';
export type CoachRagConfidence = 'high' | 'medium' | 'low';
export type CoachRagMode = 'generated' | 'evidence_summary' | 'guardrail';

export interface CoachRagCitation {
  index: number;
  chunkId: string;
  sourceLabel: string;
  sourceType: string;
  section: string;
  scoredJobId: number | null;
  relevanceScore: number;
  excerpt: string;
}

export interface CoachRagResponse {
  mode: CoachRagMode;
  answer: string;
  confidence: CoachRagConfidence;
  sources: RetrievedChunk[];
  citations: CoachRagCitation[];
  sourceReferences: Array<{
    citationIndex: number;
    relevance: string;
  }>;
  suggestedFollowUps: string[];
  caveats: string[];
  provider?: {
    name: AIProviderName;
    model?: string;
  };
  diagnostics: {
    embeddedQuestionLocally: boolean;
    usedCloudGeneration: boolean;
    retrievalTimeMs: number;
    generationTimeMs: number;
    totalCandidates: number;
    sourceCount: number;
  };
}

export interface CoachRagRequest {
  question: string;
  scope?: RetrievalScope;
  scoredJobId?: number | null;
  topK?: number;
  answerMode?: CoachRagAnswerMode;
  conversationHistory?: Array<{ role: string; content: string }>;
  config?: AppConfig;
}

interface GenerationAvailability {
  runtimeEnv: Record<string, string | undefined>;
  provider?: AIProviderConfig;
}

const CONFIDENCE_RANK: Record<CoachRagConfidence, number> = { low: 0, medium: 1, high: 2 };
const RANK_TO_CONFIDENCE: CoachRagConfidence[] = ['low', 'medium', 'high'];

const CAREER_SCOPE_RE = /\b(job|role|resume|cv|cover letter|interview|apply|application|salary|recruiter|hiring|jd|description|ats|skill|career|company|follow.?up|outreach|profile|pipeline|saved|applied|fit|match|risk|gap|strength|weak|background|prepare|screen|offer|keyword|project|experience|manager|next|candidate)\b/i;

const CoachGeneratedResponseSchema = z.object({
  answer: z.string(),
  confidence: z.enum(['high', 'medium', 'low']),
  sourceReferences: z.array(z.object({
    citationIndex: z.number(),
    relevance: z.string(),
  })).default([]),
  suggestedFollowUps: z.array(z.string()).default([]),
  caveats: z.array(z.string()).default([]),
});

function compactText(value: string, maxLength = 320) {
  const compact = value.replace(/\s+/g, ' ').trim();
  return compact.length > maxLength ? `${compact.slice(0, maxLength - 3)}...` : compact;
}

function safeJsonParse(value: string) {
  const withoutFences = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try {
    return JSON.parse(withoutFences);
  } catch {
    const start = withoutFences.indexOf('{');
    const end = withoutFences.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(withoutFences.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function hasCareerScope(request: CoachRagRequest) {
  if (request.scoredJobId) return true;
  if (CAREER_SCOPE_RE.test(request.question)) return true;
  return (request.conversationHistory || []).slice(-4).some((message) => CAREER_SCOPE_RE.test(message.content));
}

function toCitations(chunks: RetrievedChunk[]): CoachRagCitation[] {
  return chunks.map((chunk, index) => ({
    index: index + 1,
    chunkId: chunk.chunkId,
    sourceLabel: chunk.sourceLabel,
    sourceType: chunk.sourceType,
    section: chunk.section,
    scoredJobId: chunk.scoredJobId,
    relevanceScore: chunk.relevanceScore,
    excerpt: compactText(chunk.content),
  }));
}

function evidenceConfidence(chunks: RetrievedChunk[], question = ''): CoachRagConfidence {
  if (chunks.length === 0) return 'low';
  const topScore = chunks[0]?.relevanceScore || 0;
  const averageTopThree = chunks.slice(0, 3).reduce((sum, chunk) => sum + chunk.relevanceScore, 0) / Math.min(chunks.length, 3);
  const hasJobEvidence = chunks.some((chunk) => ['job_description', 'jd_analysis', 'enrichment'].includes(chunk.sourceType));
  const hasCandidateEvidence = chunks.some((chunk) => ['master_profile', 'resume_text', 'tailored_resume', 'ats_report'].includes(chunk.sourceType));
  const hasAtsEvidence = chunks.some((chunk) => chunk.sourceType === 'ats_report');
  const hasThinMarketDomain = /\b(ux|ui|designer|design|portfolio|case study|figma|wireframe|prototype|research|usability|aml|kyc|compliance|financial crime|transaction monitoring|sanctions|regulatory)\b/i.test(question);
  const hasEvidenceSynthesisIntent = /\b(background|best matches?|matches this role|ats gaps?|missing keywords?|strengthen|resume bullets?|which evidence|emphasize|case study should|lead with)\b/i.test(question);
  if (topScore >= 58 && averageTopThree >= 45) return 'high';
  if (topScore >= 30 || averageTopThree >= 25) return 'medium';
  if (hasThinMarketDomain && hasJobEvidence && hasCandidateEvidence && chunks.length >= 2) return 'medium';
  if (hasEvidenceSynthesisIntent && hasCandidateEvidence && (hasJobEvidence || hasAtsEvidence) && chunks.length >= 2) return 'medium';
  return 'low';
}

function clampConfidence(modelConfidence: CoachRagConfidence, sources: RetrievedChunk[], question: string) {
  const evidenceLevel = evidenceConfidence(sources, question);
  return RANK_TO_CONFIDENCE[Math.min(CONFIDENCE_RANK[modelConfidence], CONFIDENCE_RANK[evidenceLevel])];
}

function fallbackFollowUps(scoredJobId: number | null | undefined, sources: RetrievedChunk[]) {
  if (scoredJobId) {
    return [
      'What are the biggest risks for this role?',
      'Which resume points should I emphasize?',
      'What interview questions should I prepare?',
    ];
  }

  if (sources.some((source) => source.sourceType === 'master_profile' || source.sourceType === 'resume_text')) {
    return [
      'What are my strongest professional angles?',
      'Which skills should I highlight first?',
      'What local materials should I index next?',
    ];
  }

  return [
    'Which saved job should we discuss?',
    'How should I improve my resume for a target JD?',
    'What local materials should I index next?',
  ];
}

function sourceReferencesFromCitations(citations: CoachRagCitation[]) {
  return citations.slice(0, 4).map((citation) => ({
    citationIndex: citation.index,
    relevance: `${citation.sourceLabel} matched with ${citation.relevanceScore}% relevance.`,
  }));
}

function localActionGuidance(question: string, sources: RetrievedChunk[]) {
  const q = question.toLowerCase();
  const hasJob = sources.some((source) => ['job_description', 'jd_analysis', 'enrichment'].includes(source.sourceType));
  const hasProfile = sources.some((source) => ['master_profile', 'resume_text', 'tailored_resume'].includes(source.sourceType));
  const hasAts = sources.some((source) => source.sourceType === 'ats_report' || source.sourceType === 'jd_analysis');

  if (/\b(ats|keyword|resume|cv|tailor|bullet)\b/.test(q)) {
    return hasAts
      ? 'Practical next step: use the JD/ATS citations to choose keywords, then only add wording that is already supported by your resume/profile citations.'
      : 'Practical next step: prepare the job first so Career Seek can extract ATS keywords, then compare them against resume evidence.';
  }

  if (/\b(interview|screen|question|story|prepare)\b/.test(q)) {
    return hasJob && hasProfile
      ? 'Practical next step: turn one cited job requirement and one cited profile proof point into a short interview story.'
      : 'Practical next step: select a job and prepare materials so interview guidance can connect role requirements to your actual proof points.';
  }

  if (/\b(fit|match|apply|risk|gap|strength|weak)\b/.test(q)) {
    return hasJob && hasProfile
      ? 'Practical next step: compare the cited role requirements with the cited profile evidence before deciding whether to prepare or skip.'
      : 'Practical next step: add both resume/profile evidence and the target job description to improve fit confidence.';
  }

  return 'Practical next step: use these citations as the source of truth, then ask a narrower question about a role, resume section, ATS gap, or follow-up.';
}

function buildGuardrailResponse(request: CoachRagRequest): CoachRagResponse {
  return {
    mode: 'guardrail',
    answer: 'I can help with Career Seek topics like jobs, resumes, applications, outreach, interviews, and saved role strategy. I do not have enough relevant career context to answer that question here.',
    confidence: 'low',
    sources: [],
    citations: [],
    sourceReferences: [],
    suggestedFollowUps: fallbackFollowUps(request.scoredJobId, []),
    caveats: ['Question was outside the Career Seek coaching scope.'],
    diagnostics: {
      embeddedQuestionLocally: false,
      usedCloudGeneration: false,
      retrievalTimeMs: 0,
      generationTimeMs: 0,
      totalCandidates: 0,
      sourceCount: 0,
    },
  };
}

function buildEvidenceSummary(
  request: CoachRagRequest,
  sources: RetrievedChunk[],
  generationTimeMs: number,
  retrievalTimeMs: number,
  totalCandidates: number,
  reason: string,
  embeddedQuestionLocally: boolean,
): CoachRagResponse {
  const citations = toCitations(sources);
  const evidenceLines = citations.slice(0, 4).map((citation) =>
    `- [${citation.index}] ${citation.sourceLabel}: ${citation.excerpt}`
  );

  return {
    mode: 'evidence_summary',
    answer: sources.length > 0
      ? [
          'I am staying in local evidence mode for this answer, so I will not infer beyond the retrieved sources.',
          localActionGuidance(request.question, sources),
          '',
          evidenceLines.join('\n'),
          '',
          'I can make a fuller coaching judgment once a configured LLM provider is available.',
        ].join('\n')
      : 'I do not have enough indexed local evidence to answer this safely. Index your profile, resume, or target job materials first, then ask again.',
    confidence: evidenceConfidence(sources, request.question),
    sources,
    citations,
    sourceReferences: sourceReferencesFromCitations(citations),
    suggestedFollowUps: fallbackFollowUps(request.scoredJobId, sources),
    caveats: [reason],
    diagnostics: {
      embeddedQuestionLocally,
      usedCloudGeneration: false,
      retrievalTimeMs,
      generationTimeMs,
      totalCandidates,
      sourceCount: sources.length,
    },
  };
}

function selectedProviderFromConfig(config: AppConfig): AIProviderName | undefined {
  if (config.aiProvider) return config.aiProvider;
  if (config.geminiApiKey || config.aiProviders?.gemini?.apiKey) return 'gemini';
  return undefined;
}

function getConfiguredGenerationProvider(config: AppConfig): GenerationAvailability {
  const runtimeEnv = getAIRuntimeEnv(config);
  const selectedProvider = selectedProviderFromConfig(config);
  const discovered = discoverAIProviderConfigs(runtimeEnv);

  if (!selectedProvider) {
    const provider = discovered.find((candidate) => {
      if (!candidate.enabled) return false;
      if (candidate.requiresApiKey) return Boolean(candidate.apiKey?.trim());
      if (candidate.provider === 'ollama') {
        return config.aiProvider === 'ollama' ||
          runtimeEnv.CAREER_SEEK_ENABLE_OLLAMA === '1' ||
          Boolean(runtimeEnv.OLLAMA_BASE_URL?.trim());
      }
      return Boolean(candidate.baseUrl?.trim());
    });

    return provider ? { runtimeEnv, provider } : { runtimeEnv };
  }

  const settings = config.aiProviders?.[selectedProvider];
  if (settings?.enabled === false) return { runtimeEnv };

  const provider = discovered.find(
    (candidate) => candidate.provider === selectedProvider && candidate.enabled,
  );

  if (!provider) return { runtimeEnv };
  if (provider.requiresApiKey && !provider.apiKey) return { runtimeEnv };
  if (provider.provider === 'openai-compatible' && !provider.baseUrl) return { runtimeEnv };

  return { runtimeEnv, provider };
}

function normalizeGeneratedResponse(
  raw: unknown,
  fallbackAnswer: string,
  citations: CoachRagCitation[],
  sources: RetrievedChunk[],
  request: CoachRagRequest,
): Pick<CoachRagResponse, 'answer' | 'confidence' | 'sourceReferences' | 'suggestedFollowUps' | 'caveats'> {
  const parsed = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const answer = typeof parsed.answer === 'string' && parsed.answer.trim() ? parsed.answer.trim() : fallbackAnswer;
  const modelConfidence = parsed.confidence === 'high' || parsed.confidence === 'medium' || parsed.confidence === 'low'
    ? parsed.confidence
    : evidenceConfidence(sources, request.question);
  const confidence = clampConfidence(modelConfidence, sources, request.question);
  const sourceReferences = Array.isArray(parsed.sourceReferences)
    ? parsed.sourceReferences
        .map((ref) => {
          const citationIndex = Number((ref as Record<string, unknown>)?.citationIndex);
          if (!Number.isInteger(citationIndex) || citationIndex < 1 || citationIndex > citations.length) return null;
          return {
            citationIndex,
            relevance: typeof (ref as Record<string, unknown>)?.relevance === 'string'
              ? String((ref as Record<string, unknown>).relevance)
              : `Citation ${citationIndex} supports the answer.`,
          };
        })
        .filter((ref): ref is { citationIndex: number; relevance: string } => Boolean(ref))
        .slice(0, 4)
    : sourceReferencesFromCitations(citations);

  return {
    answer,
    confidence,
    sourceReferences: sourceReferences.length > 0 ? sourceReferences : sourceReferencesFromCitations(citations),
    suggestedFollowUps: Array.isArray(parsed.suggestedFollowUps)
      ? parsed.suggestedFollowUps.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).slice(0, 3)
      : fallbackFollowUps(request.scoredJobId, sources),
    caveats: Array.isArray(parsed.caveats)
      ? parsed.caveats.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).slice(0, 4)
      : [],
  };
}

function buildPrompt(request: CoachRagRequest, citations: CoachRagCitation[]) {
  const evidence = citations.map((citation) =>
    `[${citation.index}] ${citation.sourceLabel} (${citation.relevanceScore}% relevance)\n${citation.excerpt}`
  ).join('\n\n');
  const history = (request.conversationHistory || []).slice(-4)
    .map((message) => `${message.role}: ${message.content}`)
    .join('\n');
  const detail = request.answerMode === 'detailed'
    ? 'Give a detailed but grounded coaching answer.'
    : 'Give a concise, actionable coaching answer.';

  return {
    systemPrompt: [
      'You are the Career Seek coach.',
      detail,
      'Use only the supplied local evidence.',
      'Do not invent skills, job facts, application status, compensation, or outreach history.',
      'If evidence is insufficient, say so and set confidence to low.',
      'For broad UX/design career questions with sparse local evidence, you may add a clearly labeled "General advice" section, but do not present it as job-specific or source-backed.',
      'Cite claims with citation indexes like [1].',
    ].join('\n'),
    userPrompt: [
      `Question: ${request.question}`,
      history ? `Recent conversation:\n${history}` : '',
      `Local evidence:\n${evidence}`,
      'Return strict JSON with keys: answer, confidence, sourceReferences, suggestedFollowUps, caveats.',
      'sourceReferences must use { "citationIndex": number, "relevance": string } and only cite supplied citation indexes.',
    ].filter(Boolean).join('\n\n'),
  };
}

export class CoachRagEngine {
  async answer(request: CoachRagRequest): Promise<CoachRagResponse> {
    const normalizedRequest = {
      ...request,
      scope: request.scope || 'all_materials',
      scoredJobId: request.scoredJobId ?? null,
      answerMode: request.answerMode || 'concise',
    };

    if (!normalizedRequest.question.trim() || !hasCareerScope(normalizedRequest)) {
      return buildGuardrailResponse(normalizedRequest);
    }

    const genStart = Date.now();
    const [queryEmbedding] = await embedCoachTexts([normalizedRequest.question]);
    const embeddedQuestionLocally = Boolean(queryEmbedding?.length);
    const topK = normalizedRequest.topK || (normalizedRequest.answerMode === 'detailed' ? 12 : 8);
    const retrieval = await retrieve(
      normalizedRequest.question,
      normalizedRequest.scope,
      normalizedRequest.scoredJobId,
      topK,
    );

    const generationAvailability = getConfiguredGenerationProvider(normalizedRequest.config || getAppConfig());
    if (retrieval.chunks.length === 0 || !generationAvailability.provider) {
      const reason = retrieval.chunks.length === 0
        ? 'No sufficiently relevant local sources were retrieved.'
        : 'No user-configured LLM provider is available; no cloud generation was attempted.';
      return buildEvidenceSummary(
        normalizedRequest,
        retrieval.chunks,
        Date.now() - genStart,
        retrieval.retrievalTimeMs,
        retrieval.totalCandidates,
        reason,
        embeddedQuestionLocally,
      );
    }

    const citations = toCitations(retrieval.chunks);
    const fallback = buildEvidenceSummary(
      normalizedRequest,
      retrieval.chunks,
      0,
      retrieval.retrievalTimeMs,
      retrieval.totalCandidates,
      'Generated response could not be normalized; local evidence summary used.',
      embeddedQuestionLocally,
    );
    const prompt = buildPrompt(normalizedRequest, citations);

    try {
      const aiResponse = await getAIManager({ env: generationAvailability.runtimeEnv }).generate({
        provider: generationAvailability.provider.provider,
        model: generationAvailability.provider.defaultModel,
        systemPrompt: prompt.systemPrompt,
        userPrompt: prompt.userPrompt,
        temperature: 0.2,
        maxTokens: normalizedRequest.answerMode === 'detailed' ? 1800 : 1000,
        responseFormat: { type: 'json', schema: CoachGeneratedResponseSchema },
        metadata: {
          task: 'coach_rag_engine',
          scope: normalizedRequest.scope,
          scoredJobId: normalizedRequest.scoredJobId,
          sourceCount: retrieval.chunks.length,
        },
      });
      const parsed = aiResponse.parsed || safeJsonParse(aiResponse.text);
      const normalized = normalizeGeneratedResponse(
        parsed,
        fallback.answer,
        citations,
        retrieval.chunks,
        normalizedRequest,
      );

      return {
        mode: 'generated',
        ...normalized,
        sources: retrieval.chunks,
        citations,
        provider: {
          name: aiResponse.provider,
          model: aiResponse.model,
        },
        diagnostics: {
          embeddedQuestionLocally,
          usedCloudGeneration: generationAvailability.provider.providerKind !== 'local',
          retrievalTimeMs: retrieval.retrievalTimeMs,
          generationTimeMs: Date.now() - genStart,
          totalCandidates: retrieval.totalCandidates,
          sourceCount: retrieval.chunks.length,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? 'Unknown generation error');
      return buildEvidenceSummary(
        normalizedRequest,
        retrieval.chunks,
        Date.now() - genStart,
        retrieval.retrievalTimeMs,
        retrieval.totalCandidates,
        `Generation failed, so local evidence summary was used: ${message.slice(0, 240)}`,
        embeddedQuestionLocally,
      );
    }
  }
}

export const coachRagEngine = new CoachRagEngine();

export function answerWithCoachRag(request: CoachRagRequest) {
  return coachRagEngine.answer(request);
}
