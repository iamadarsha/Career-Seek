import { z } from 'zod';
import { getAIManager } from './manager';
import { ProfileSchema } from '../schemas/profile';
import {
  buildDeterministicProfileFromResumeText,
  safeAiErrorMessage,
  type ExtractProfileResult,
} from '../services/gemini';
import type { ResumePipelineRunResult } from '../services/resume/types';

const ClarificationQuestionSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  reason: z.string().min(1),
  field: z.string().optional(),
  type: z.enum(['short_text', 'long_text', 'choice']).optional(),
  options: z.array(z.string()).optional(),
});

const ResumeAnalysisSchema = z.object({
  confidence: z.number().min(0).max(100),
  confidenceNotes: z.string(),
  extractionIssues: z.array(z.string()).default([]),
  needsClarification: z.boolean().default(false),
  clarificationQuestions: z.array(ClarificationQuestionSchema).default([]),
});

const ExtractedResumeSchema = z.object({
  profile: ProfileSchema,
  analysis: ResumeAnalysisSchema,
});

export interface StructuredResumeExtractionContext {
  pipeline?: ResumePipelineRunResult;
  maxResumeTextChars?: number;
}

export type GatewayProfileExtractionResult = ExtractProfileResult & {
  extractionMetadata: {
    mode: 'ai_manager' | 'deterministic_fallback';
    provider?: string;
    model?: string;
    fallbackChain?: Array<{ provider: string; model: string }>;
    usage?: {
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
    };
    error?: string;
  };
};

function compactSectionEvidence(pipeline: ResumePipelineRunResult | undefined) {
  if (!pipeline) return '';

  const sectionLines = pipeline.sections.map((section) => {
    const preview = section.text.replace(/\s+/g, ' ').slice(0, 900);
    return `- ${section.title} (${section.kind}, ${section.text.length} chars): ${preview}`;
  });

  const chunkLines = pipeline.chunks
    .filter((chunk) => ['header', 'summary', 'skills', 'experience', 'projects', 'education'].includes(chunk.sectionKind))
    .slice(0, 12)
    .map((chunk) => `- ${chunk.sectionTitle} chunk ${chunk.ordinal + 1}: ${chunk.text.replace(/\s+/g, ' ').slice(0, 700)}`);

  return `
Pipeline evidence:
- Parser: ${pipeline.parsed.metadata.parserId} via ${pipeline.parsed.metadata.extractionMethod}
- Parser confidence: ${pipeline.parsed.metadata.confidence}
- Sections: ${pipeline.sections.length}
- Chunks: ${pipeline.chunks.length}
- Embedding: ${pipeline.embeddingProvider.id} (${pipeline.embeddingProvider.mode})
- Vector write: ${pipeline.vectorWrite.ok ? 'ok' : 'not_ok'} (${pipeline.vectorWrite.count} chunks)

Detected sections:
${sectionLines.join('\n')}

High-signal chunks:
${chunkLines.join('\n')}
  `.trim();
}

function normalizeFallbackResult(result: ExtractProfileResult, reason: string): GatewayProfileExtractionResult {
  const replaceGemini = (value: string) => value.replace(/\bGemini\b/g, 'AI gateway');

  return {
    profile: {
      ...result.profile,
      gaps: (result.profile.gaps || []).map(replaceGemini),
      metadata: {
        ...(result.profile.metadata || {}),
        confidenceNotes: replaceGemini(
          result.profile.metadata?.confidenceNotes ||
          'Deterministic profile extracted from resume text because AI extraction was unavailable.',
        ),
      },
    },
    analysis: {
      ...result.analysis,
      confidenceNotes: replaceGemini(result.analysis.confidenceNotes),
      extractionIssues: [
        ...result.analysis.extractionIssues.map(replaceGemini),
        `AI gateway extraction fallback used: ${reason}`,
      ],
      needsClarification: true,
    },
    extractionMetadata: {
      mode: 'deterministic_fallback',
      error: reason,
    },
  };
}

export async function extractProfileWithGateway(
  resumeText: string,
  env: Record<string, string | undefined> = process.env,
  context: StructuredResumeExtractionContext = {},
): Promise<GatewayProfileExtractionResult> {
  const manager = getAIManager({ env });
  const responseFormat = {
    type: 'json' as const,
    schema: ExtractedResumeSchema,
  };
  const pipelineEvidence = compactSectionEvidence(context.pipeline);
  const maxResumeTextChars = context.maxResumeTextChars || 24_000;

  const prompt = `
You are a careful resume analyst for a local-first job search app.

Return a JSON object with:
- "profile": a structured candidate profile
- "analysis": confidence, extraction issues, and clarification questions

Rules:
1. Use only evidence found in the resume text.
2. Infer headline, seniority, strengths, and likely skills when strongly supported.
3. Never invent employers, dates, degrees, salary, or achievements.
4. If anything is unclear, record it in analysis.extractionIssues and ask direct clarification questions.
5. Return valid JSON only.
6. Prefer the section and chunk evidence when the full resume text has layout noise.

${pipelineEvidence ? `${pipelineEvidence}\n\n` : ''}
Resume text:
${resumeText.slice(0, maxResumeTextChars)}
  `.trim();

  try {
    const result = await manager.generate({
      userPrompt: prompt,
      responseFormat,
      temperature: 0.2,
      maxTokens: 2200,
      metadata: {
        task: 'resume_profile_extraction',
      },
    });

    const parsed = ExtractedResumeSchema.parse(result.parsed || JSON.parse(result.text));
    return {
      ...parsed,
      extractionMetadata: {
        mode: 'ai_manager',
        provider: result.provider,
        model: result.model,
        fallbackChain: result.fallbackChain,
        usage: result.usage,
      },
    };
  } catch (error) {
    const reason = safeAiErrorMessage(error);
    return normalizeFallbackResult(
      buildDeterministicProfileFromResumeText(resumeText, reason),
      reason,
    );
  }
}
