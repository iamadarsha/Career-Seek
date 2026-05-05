import crypto from 'crypto';

import {
  createDefaultLocalResumeEmbeddingProvider,
  createLocalKeywordEmbeddingProvider,
} from '../resume/embeddings';
import type { ResumeEmbedding, ResumeEmbeddingMode, ResumeEmbeddingProvider } from '../resume/types';

export type JobVectorProvider = 'local-resume-embedding' | 'local-keyword-hash';
export type JobVectorMode = ResumeEmbeddingMode | 'qdrant' | 'in_memory_cosine';

export interface JobSearchableDocument {
  id: string | number;
  title?: unknown;
  company?: unknown;
  location?: unknown;
  description?: unknown;
  snippet?: unknown;
  requirements?: unknown;
  responsibilities?: unknown;
  skills?: unknown;
  tags?: unknown;
  source?: unknown;
  url?: unknown;
  dreamSignals?: unknown;
  metadata?: Record<string, unknown>;
  embedding?: number[];
  [key: string]: unknown;
}

export interface JobEmbeddingMetadata {
  provider: JobVectorProvider;
  providerId: string;
  mode: ResumeEmbeddingMode;
  model: string;
  dimensions: number;
  fallback: boolean;
  fallbackReason?: string;
  textCharacters: number;
}

export interface EmbeddedJobDocument {
  id: string;
  job: JobSearchableDocument;
  text: string;
  vector: number[];
  metadata: JobEmbeddingMetadata;
}

export interface RankedJobMetadata extends Omit<JobEmbeddingMetadata, 'provider' | 'fallback' | 'fallbackReason'> {
  provider: JobVectorProvider | 'qdrant';
  rankingMode: 'dream_job' | 'similar_job';
  searchMode: 'qdrant' | 'in_memory_cosine';
  fallback: boolean;
  fallbackReason?: string;
  queryCharacters: number;
}

export interface RankedJobResult {
  job: JobSearchableDocument;
  score: number;
  rank: number;
  similarity: number;
  metadata: RankedJobMetadata;
}

export interface QdrantJobSearchOptions {
  baseUrl?: string;
  collectionName?: string;
  apiKey?: string;
  enabled?: boolean;
  scoreThreshold?: number;
  filter?: Record<string, unknown>;
}

export interface JobVectorSearchOptions {
  limit?: number;
  embeddingProvider?: ResumeEmbeddingProvider;
  env?: Record<string, string | undefined>;
  qdrant?: QdrantJobSearchOptions;
}

export interface RankDreamJobsInput extends JobVectorSearchOptions {
  dreamJob: string | JobSearchableDocument;
  jobs: JobSearchableDocument[];
}

export interface SearchSimilarJobsInput extends JobVectorSearchOptions {
  query: string | JobSearchableDocument;
  jobs?: JobSearchableDocument[];
}

interface QdrantSearchResult {
  id: string;
  score: number;
  payload: Record<string, unknown>;
}

function compactText(value: unknown) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function flattenUnknown(value: unknown, depth = 0): string[] {
  if (value == null || depth > 4) return [];
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return [String(value)];
  }
  if (Array.isArray(value)) return value.flatMap((item) => flattenUnknown(item, depth + 1));
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap((item) => flattenUnknown(item, depth + 1));
  }
  return [];
}

function uniqueStrings(values: unknown[], limit = 160) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values.flatMap((item) => flattenUnknown(item))) {
    const text = compactText(value);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= limit) break;
  }

  return result;
}

export function buildJobDocumentText(job: string | JobSearchableDocument) {
  if (typeof job === 'string') return compactText(job);

  return uniqueStrings([
    job.title,
    job.company,
    job.location,
    job.description,
    job.snippet,
    job.requirements,
    job.responsibilities,
    job.skills,
    job.tags,
    job.dreamSignals,
    job.metadata,
  ]).join('\n');
}

function localOnlyEnv(env: Record<string, string | undefined>) {
  return {
    ...env,
    CAREER_SEEK_ALLOW_MODEL_DOWNLOADS: '0',
  };
}

function createLocalOnlyProvider(
  provider?: ResumeEmbeddingProvider,
  env: Record<string, string | undefined> = process.env,
) {
  if (!provider) {
    return createDefaultLocalResumeEmbeddingProvider(localOnlyEnv(env));
  }

  if (provider.requiresApiKey || provider.mode === 'external_embedding') {
    return createLocalKeywordEmbeddingProvider();
  }

  return provider;
}

function vectorMagnitude(vector: number[]) {
  return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
}

export function cosineSimilarity(left: number[], right: number[]) {
  const length = Math.min(left.length, right.length);
  if (!length) return 0;

  let dot = 0;
  for (let index = 0; index < length; index += 1) {
    dot += Number(left[index] || 0) * Number(right[index] || 0);
  }

  const magnitude = vectorMagnitude(left) * vectorMagnitude(right);
  if (!magnitude) return 0;
  return Math.max(-1, Math.min(1, dot / magnitude));
}

function embeddingMetadata(
  embedding: ResumeEmbedding,
  provider: ResumeEmbeddingProvider,
  textCharacters: number,
): JobEmbeddingMetadata {
  const providerIsFallback = provider.mode !== embedding.mode || embedding.mode === 'local_keyword_hash';
  return {
    provider: embedding.mode === 'local_keyword_hash' ? 'local-keyword-hash' : 'local-resume-embedding',
    providerId: provider.id,
    mode: embedding.mode,
    model: embedding.model,
    dimensions: embedding.dimensions,
    fallback: providerIsFallback || Boolean(provider.fallbackReason),
    fallbackReason: provider.fallbackReason,
    textCharacters,
  };
}

export async function embedJobDocument(
  job: string | JobSearchableDocument,
  options: Pick<JobVectorSearchOptions, 'embeddingProvider' | 'env'> = {},
): Promise<EmbeddedJobDocument> {
  const text = buildJobDocumentText(job);
  const provider = createLocalOnlyProvider(options.embeddingProvider, options.env || process.env);
  const [embedding] = await provider.embed([text]);
  const jobDocument = typeof job === 'string'
    ? { id: stableJobId(text), description: text }
    : job;

  return {
    id: String(jobDocument.id),
    job: jobDocument,
    text,
    vector: embedding?.vector || [],
    metadata: embeddingMetadata(
      embedding || {
        chunkId: '0',
        vector: [],
        dimensions: 0,
        model: 'not-run',
        mode: 'disabled',
      },
      provider,
      text.length,
    ),
  };
}

function stableJobId(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 16);
}

const DREAM_STOP_WORDS = new Set([
  'and',
  'are',
  'for',
  'from',
  'job',
  'jobs',
  'role',
  'the',
  'with',
  'work',
]);

function searchableTerms(text: string) {
  return Array.from(new Set(
    compactText(text)
      .toLowerCase()
      .replace(/[^a-z0-9+#.]+/g, ' ')
      .split(/\s+/)
      .map((term) => term.trim())
      .filter((term) => term.length > 2 && !DREAM_STOP_WORDS.has(term)),
  ));
}

function buildTermWeights(queryTerms: string[], jobTexts: string[]) {
  const weights = new Map<string, number>();
  const totalJobs = Math.max(1, jobTexts.length);

  for (const term of queryTerms) {
    const documentFrequency = jobTexts.reduce((count, text) => {
      return count + (searchableTerms(text).includes(term) ? 1 : 0);
    }, 0);
    weights.set(term, Math.log((totalJobs + 1) / (documentFrequency + 1)) + 1);
  }

  return weights;
}

function lexicalOverlapScore(
  queryText: string,
  jobText: string,
  queryTerms = searchableTerms(queryText),
  termWeights = new Map(queryTerms.map((term) => [term, 1])),
) {
  if (!queryTerms.length) return 0;

  const jobTerms = new Set(searchableTerms(jobText));
  const matchedWeight = queryTerms.reduce((sum, term) => {
    return sum + (jobTerms.has(term) ? termWeights.get(term) || 1 : 0);
  }, 0);
  const totalWeight = queryTerms.reduce((sum, term) => sum + (termWeights.get(term) || 1), 0);
  const directScore = totalWeight > 0 ? matchedWeight / totalWeight : 0;
  const normalizedJobText = ` ${compactText(jobText).toLowerCase()} `;
  const phraseScore = queryTerms
    .map((term, index) => `${term} ${queryTerms[index + 1] || ''}`.trim())
    .filter((phrase) => phrase.includes(' ') && normalizedJobText.includes(` ${phrase} `))
    .length / Math.max(1, queryTerms.length - 1);

  return Math.min(100, Math.round(directScore * 78 + phraseScore * 22));
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

async function parseResponse(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function searchQdrant(
  vector: number[],
  options: Required<Pick<QdrantJobSearchOptions, 'baseUrl' | 'collectionName'>> & QdrantJobSearchOptions,
  limit: number,
): Promise<QdrantSearchResult[]> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (options.apiKey) headers['api-key'] = options.apiKey;

  const response = await fetch(
    `${trimTrailingSlash(options.baseUrl)}/collections/${encodeURIComponent(options.collectionName)}/points/search`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        vector,
        limit,
        filter: options.filter,
        score_threshold: options.scoreThreshold,
        with_payload: true,
      }),
    },
  );

  if (!response.ok) {
    const body = await parseResponse(response);
    throw new Error(`Qdrant job search failed: ${JSON.stringify(body)}`);
  }

  const body = await parseResponse(response) as {
    result?: Array<{ id: string | number; score: number; payload?: Record<string, unknown> }>;
  } | null;

  return (body?.result || []).map((item) => ({
    id: String(item.payload?.sourcePointId || item.id),
    score: Number(item.score || 0),
    payload: item.payload || {},
  }));
}

function qdrantOptionsFromEnv(
  input?: QdrantJobSearchOptions,
  env: Record<string, string | undefined> = process.env,
) {
  const baseUrl = input?.baseUrl || env.QDRANT_URL || env.JOBS_QDRANT_URL;
  const collectionName = input?.collectionName || env.QDRANT_JOBS_COLLECTION || env.JOBS_VECTOR_COLLECTION || 'career_seek_jobs';

  if (input?.enabled === false || !baseUrl) return null;

  return {
    ...input,
    baseUrl,
    collectionName,
    apiKey: input?.apiKey || env.QDRANT_API_KEY || env.JOBS_QDRANT_API_KEY,
  };
}

function rankEmbeddedJobs(
  query: EmbeddedJobDocument,
  jobs: EmbeddedJobDocument[],
  limit: number,
  rankingMode: 'dream_job' | 'similar_job',
  fallbackReason?: string,
): RankedJobResult[] {
  const queryTerms = rankingMode === 'dream_job' ? searchableTerms(query.text) : [];
  const termWeights = rankingMode === 'dream_job'
    ? buildTermWeights(queryTerms, jobs.map((job) => job.text))
    : new Map<string, number>();

  return jobs
    .map((embedded) => {
      const similarity = cosineSimilarity(query.vector, embedded.vector);
      const cosineScore = Math.max(0, similarity * 100);
      const lexicalScore = rankingMode === 'dream_job'
        ? lexicalOverlapScore(query.text, embedded.text, queryTerms, termWeights)
        : 0;
      const combinedScore = rankingMode === 'dream_job'
        ? (cosineScore * 0.3) + (lexicalScore * 0.7)
        : cosineScore;
      return {
        job: embedded.job,
        score: Number(Math.max(0, combinedScore).toFixed(2)),
        rank: 0,
        similarity: Number(similarity.toFixed(6)),
        metadata: {
          ...embedded.metadata,
          rankingMode,
          searchMode: 'in_memory_cosine' as const,
          fallback: true,
          fallbackReason,
          queryCharacters: query.text.length,
        },
      };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((result, index) => ({ ...result, rank: index + 1 }));
}

function qdrantResultToRankedJob(
  result: QdrantSearchResult,
  index: number,
  query: EmbeddedJobDocument,
  rankingMode: 'dream_job' | 'similar_job',
): RankedJobResult {
  const payload = result.payload;
  const job = {
    id: result.id,
    title: payload.title,
    company: payload.company,
    location: payload.location,
    description: payload.description || payload.snippet,
    source: payload.source,
    url: payload.url,
    metadata: payload,
  };

  return {
    job,
    score: Number(Math.max(0, result.score * 100).toFixed(2)),
    rank: index + 1,
    similarity: Number(result.score.toFixed(6)),
    metadata: {
      ...query.metadata,
      provider: 'qdrant',
      rankingMode,
      searchMode: 'qdrant',
      fallback: false,
      queryCharacters: query.text.length,
    },
  };
}

export async function searchSimilarJobs(input: SearchSimilarJobsInput): Promise<RankedJobResult[]> {
  const limit = Math.max(1, input.limit || 10);
  const query = await embedJobDocument(input.query, input);
  const qdrant = qdrantOptionsFromEnv(input.qdrant, input.env || process.env);

  if (qdrant) {
    try {
      const results = await searchQdrant(query.vector, qdrant, limit);
      if (results.length) {
        return results.map((result, index) => qdrantResultToRankedJob(result, index, query, 'similar_job'));
      }
    } catch {
      // Fall through to deterministic in-memory ranking from the supplied jobs.
    }
  }

  const jobs = input.jobs || [];
  const embeddedJobs = await Promise.all(jobs.map((job) => embedJobDocument(job, input)));
  return rankEmbeddedJobs(
    query,
    embeddedJobs,
    limit,
    'similar_job',
    qdrant ? 'Qdrant unavailable or returned no results; used deterministic in-memory cosine ranking.' : 'Qdrant is not configured; used deterministic in-memory cosine ranking.',
  );
}

export async function rankDreamJobs(input: RankDreamJobsInput): Promise<RankedJobResult[]> {
  const limit = Math.max(1, input.limit || input.jobs.length || 10);
  const dreamJob = await embedJobDocument(input.dreamJob, input);
  const embeddedJobs = await Promise.all(input.jobs.map((job) => embedJobDocument(job, input)));

  return rankEmbeddedJobs(
    dreamJob,
    embeddedJobs,
    limit,
    'dream_job',
    'Dream-job ranking uses deterministic in-memory cosine over the supplied jobs.',
  );
}
