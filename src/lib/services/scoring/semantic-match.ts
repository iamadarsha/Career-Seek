import {
  createDefaultLocalResumeEmbeddingProvider,
  createLocalKeywordEmbeddingProvider,
} from '../resume/embeddings';
import type { ResumeEmbeddingMode, ResumeEmbeddingProvider } from '../resume/types';

interface StructuredResumeLike {
  headline?: unknown;
  summary?: unknown;
  rawSummary?: unknown;
  skills?: unknown;
  tools?: unknown;
  domains?: unknown;
  experience?: unknown;
  projects?: unknown;
  achievements?: unknown;
  education?: unknown;
  certifications?: unknown;
  strengths?: unknown;
}

interface JdAnalysisLike {
  mustHaveSkills?: unknown;
  preferredSkills?: unknown;
  atsKeywords?: unknown;
  domainLanguage?: unknown;
  senioritySignals?: unknown;
  leadershipSignals?: unknown;
  toolRequirements?: unknown;
  businessContext?: unknown;
  hiringPriorities?: unknown;
}

export type StructuredResumeSource = StructuredResumeLike | Record<string, unknown>;
export type JobSemanticSource = JdAnalysisLike | Record<string, unknown>;

export interface SemanticMatchInput {
  resumeText?: string;
  structuredResume?: StructuredResumeSource | null;
  jobText?: string;
  jdAnalysis?: JobSemanticSource | null;
  embeddingProvider?: ResumeEmbeddingProvider;
  env?: Record<string, string | undefined>;
}

export interface SemanticMatchResult {
  similarity: number;
  similarityPct: number;
  rawCosine: number;
  dimensions: number;
  model: string;
  mode: ResumeEmbeddingMode;
  provider: string;
  warnings: string[];
  resumeCharacters: number;
  jobCharacters: number;
}

function compactText(value: unknown) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueStrings(values: unknown[], limit = 120) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const text = compactText(value);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= limit) break;
  }

  return result;
}

function flattenUnknown(value: unknown, depth = 0): string[] {
  if (value == null || depth > 4) return [];
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return [String(value)];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenUnknown(item, depth + 1));
  }
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap((item) => flattenUnknown(item, depth + 1));
  }
  return [];
}

function joinParts(parts: unknown[]) {
  return uniqueStrings(parts.flatMap((part) => flattenUnknown(part))).join('\n');
}

export function buildResumeSemanticText(input: {
  resumeText?: string;
  structuredResume?: StructuredResumeSource | null;
}) {
  const structured = input.structuredResume || {};
  const profileSkills = (structured as StructuredResumeLike).skills;

  return compactText(joinParts([
    input.resumeText,
    (structured as StructuredResumeLike).headline,
    (structured as StructuredResumeLike).summary,
    (structured as StructuredResumeLike).rawSummary,
    (structured as StructuredResumeLike).skills,
    profileSkills && typeof profileSkills === 'object' ? Object.values(profileSkills) : profileSkills,
    (structured as StructuredResumeLike).tools,
    (structured as StructuredResumeLike).domains,
    (structured as StructuredResumeLike).experience,
    (structured as StructuredResumeLike).projects,
    (structured as StructuredResumeLike).achievements,
    (structured as StructuredResumeLike).education,
    (structured as StructuredResumeLike).certifications,
    (structured as StructuredResumeLike).strengths,
  ]));
}

export function buildJobSemanticText(input: {
  jobText?: string;
  jdAnalysis?: JobSemanticSource | null;
}) {
  const jd = input.jdAnalysis || {};

  return compactText(joinParts([
    input.jobText,
    (jd as JdAnalysisLike).mustHaveSkills,
    (jd as JdAnalysisLike).preferredSkills,
    (jd as JdAnalysisLike).atsKeywords,
    (jd as JdAnalysisLike).domainLanguage,
    (jd as JdAnalysisLike).senioritySignals,
    (jd as JdAnalysisLike).leadershipSignals,
    (jd as JdAnalysisLike).toolRequirements,
    (jd as JdAnalysisLike).businessContext,
    (jd as JdAnalysisLike).hiringPriorities,
    (jd as Record<string, unknown>).title,
    (jd as Record<string, unknown>).company,
    (jd as Record<string, unknown>).snippet,
    (jd as Record<string, unknown>).description,
    (jd as Record<string, unknown>).requirements,
    (jd as Record<string, unknown>).responsibilities,
  ]));
}

function vectorMagnitude(vector: number[]) {
  return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
}

function cosineSimilarity(left: number[], right: number[]) {
  const length = Math.min(left.length, right.length);
  if (!length) return 0;

  let dot = 0;
  for (let index = 0; index < length; index += 1) {
    dot += left[index] * right[index];
  }

  const magnitude = vectorMagnitude(left) * vectorMagnitude(right);
  if (!magnitude) return 0;
  return Math.max(-1, Math.min(1, dot / magnitude));
}

function localOnlyEmbeddingEnv(env: Record<string, string | undefined>) {
  return {
    ...env,
    CAREER_SEEK_ALLOW_MODEL_DOWNLOADS: '0',
  };
}

function defaultProvider(env?: Record<string, string | undefined>) {
  return createDefaultLocalResumeEmbeddingProvider(localOnlyEmbeddingEnv(env || process.env));
}

function lowInformationWarning(label: string, text: string) {
  const words = text.split(/\s+/).filter(Boolean);
  if (!text) return `${label} text is empty; semantic similarity is 0.`;
  if (words.length < 20) return `${label} text is short, so semantic similarity may be noisy.`;
  return null;
}

export async function compareResumeToJobSemanticMatch(
  input: SemanticMatchInput,
): Promise<SemanticMatchResult> {
  const warnings: string[] = [];
  const resumeText = buildResumeSemanticText(input);
  const jobText = buildJobSemanticText(input);

  const resumeWarning = lowInformationWarning('Resume', resumeText);
  const jobWarning = lowInformationWarning('Job', jobText);
  if (resumeWarning) warnings.push(resumeWarning);
  if (jobWarning) warnings.push(jobWarning);

  if (!resumeText || !jobText) {
    return {
      similarity: 0,
      similarityPct: 0,
      rawCosine: 0,
      dimensions: 0,
      model: 'not-run',
      mode: 'disabled',
      provider: 'disabled',
      warnings,
      resumeCharacters: resumeText.length,
      jobCharacters: jobText.length,
    };
  }

  let provider = input.embeddingProvider || defaultProvider(input.env);
  if (provider.requiresApiKey || provider.mode === 'external_embedding') {
    warnings.push(`Embedding provider ${provider.id} is not local-only; used deterministic keyword-hash fallback.`);
    provider = createLocalKeywordEmbeddingProvider();
  }

  const embeddings = await provider.embed([resumeText, jobText]);
  const resumeEmbedding = embeddings[0];
  const jobEmbedding = embeddings[1];

  if (!resumeEmbedding || !jobEmbedding) {
    const fallback = createLocalKeywordEmbeddingProvider();
    warnings.push(`Embedding provider ${provider.id} returned incomplete vectors; used deterministic keyword-hash fallback.`);
    const fallbackEmbeddings = await fallback.embed([resumeText, jobText]);
    return buildSemanticMatchResult({
      resumeText,
      jobText,
      provider: fallback,
      resumeVector: fallbackEmbeddings[0]?.vector || [],
      jobVector: fallbackEmbeddings[1]?.vector || [],
      model: fallbackEmbeddings[0]?.model || fallback.id,
      mode: fallbackEmbeddings[0]?.mode || fallback.mode,
      dimensions: fallbackEmbeddings[0]?.dimensions || fallback.dimensions,
      warnings,
    });
  }

  if (resumeEmbedding.dimensions !== jobEmbedding.dimensions) {
    warnings.push(`Embedding dimensions differ (${resumeEmbedding.dimensions} vs ${jobEmbedding.dimensions}); cosine used the shared prefix only.`);
  }

  if (provider.fallbackReason) {
    warnings.push(`Local transformer embeddings were unavailable; used deterministic fallback (${provider.fallbackReason}).`);
  }

  return buildSemanticMatchResult({
    resumeText,
    jobText,
    provider,
    resumeVector: resumeEmbedding.vector,
    jobVector: jobEmbedding.vector,
    model: resumeEmbedding.model || jobEmbedding.model || provider.id,
    mode: resumeEmbedding.mode || jobEmbedding.mode || provider.mode,
    dimensions: Math.min(resumeEmbedding.dimensions, jobEmbedding.dimensions),
    warnings,
  });
}

function buildSemanticMatchResult(input: {
  resumeText: string;
  jobText: string;
  provider: ResumeEmbeddingProvider;
  resumeVector: number[];
  jobVector: number[];
  model: string;
  mode: ResumeEmbeddingMode;
  dimensions: number;
  warnings: string[];
}): SemanticMatchResult {
  const rawCosine = cosineSimilarity(input.resumeVector, input.jobVector);
  const similarity = Math.max(0, Math.min(1, rawCosine));

  return {
    similarity: Number(similarity.toFixed(4)),
    similarityPct: Math.round(similarity * 100),
    rawCosine: Number(rawCosine.toFixed(4)),
    dimensions: input.dimensions,
    model: input.model,
    mode: input.mode,
    provider: input.provider.id,
    warnings: input.warnings,
    resumeCharacters: input.resumeText.length,
    jobCharacters: input.jobText.length,
  };
}

export async function compareStructuredResumeToJd(
  structuredResume: StructuredResumeSource,
  jdAnalysis: JobSemanticSource,
  options: Omit<SemanticMatchInput, 'structuredResume' | 'jdAnalysis'> = {},
) {
  return compareResumeToJobSemanticMatch({
    ...options,
    structuredResume,
    jdAnalysis,
  });
}
