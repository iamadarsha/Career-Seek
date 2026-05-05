import { getAIManager } from '../../ai/manager';
import { discoverAIProviderConfigs } from '../../ai/providers';
import { getAIRuntimeEnv, getAppConfig } from '../../config';
import { getDb } from '../../../db';
import { searchQueries } from '../../../db/schema';
import { searchJobs, type SearchableJob } from '../../search';

interface SearchMatch {
  id: number;
  reason: string;
  score?: number;
  source?: 'local' | 'meilisearch' | 'ai';
}

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'for',
  'from',
  'in',
  'me',
  'my',
  'of',
  'on',
  'or',
  'role',
  'roles',
  'show',
  'the',
  'to',
  'with',
]);

const QUERY_EXPANSIONS: Record<string, string[]> = {
  ai: ['ai', 'artificial intelligence', 'machine learning', 'ml', 'llm', 'genai'],
  analytics: ['analytics', 'data', 'insights', 'metrics', 'bi'],
  bangalore: ['bangalore', 'bengaluru'],
  bengaluru: ['bengaluru', 'bangalore'],
  hybrid: ['hybrid'],
  pm: ['product manager', 'product management', 'pm'],
  remote: ['remote', 'work from home', 'wfh'],
  startup: ['startup', 'early stage', 'founding'],
};

function normalizeText(value: unknown) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9#+.\s-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function queryTokens(query: string) {
  const tokens = normalizeText(query)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));

  return Array.from(new Set(tokens));
}

function jobValue(job: any, key: string) {
  return job?.normalizedJob?.[key] ?? job?.normalized_jobs?.[key] ?? job?.[key] ?? '';
}

function jobScore(job: any) {
  return Number(job?.score ?? job?.scoredJob?.score ?? job?.scored_jobs?.score ?? 0);
}

function scoredJobId(job: any) {
  return Number(job?.id ?? job?.scoredJob?.id ?? job?.scored_jobs?.id);
}

function toSearchableJob(job: any): SearchableJob {
  return {
    id: scoredJobId(job),
    title: String(jobValue(job, 'title') || ''),
    company: String(jobValue(job, 'company') || ''),
    location: jobValue(job, 'location') || undefined,
    portal: jobValue(job, 'portal') || undefined,
    url: jobValue(job, 'url') || undefined,
    applyUrl: jobValue(job, 'applyUrl') || undefined,
    snippet: jobValue(job, 'snippet') || undefined,
    employmentType: jobValue(job, 'employmentType') || undefined,
    isRemote: Boolean(jobValue(job, 'isRemote')),
    isHybrid: Boolean(jobValue(job, 'isHybrid')),
    salaryMin: Number(jobValue(job, 'salaryMin')) || undefined,
    salaryMax: Number(jobValue(job, 'salaryMax')) || undefined,
    salaryCurrency: jobValue(job, 'salaryCurrency') || undefined,
    experienceMin: Number(jobValue(job, 'experienceMin')) || undefined,
    experienceMax: Number(jobValue(job, 'experienceMax')) || undefined,
    postedDate: jobValue(job, 'postedDate') || undefined,
    scrapedAt: jobValue(job, 'scrapedAt') || undefined,
    score: jobScore(job),
    tier: job?.tier ?? job?.scoredJob?.tier ?? job?.scored_jobs?.tier,
  };
}

function scoreLocalMatch(query: string, job: any) {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return { score: 1, hits: ['ranked fit'] };

  const fields = {
    title: normalizeText(jobValue(job, 'title')),
    company: normalizeText(jobValue(job, 'company')),
    location: normalizeText(jobValue(job, 'location')),
    snippet: normalizeText(jobValue(job, 'snippet')),
    portal: normalizeText(jobValue(job, 'portal')),
  };

  let score = 0;
  const hits: string[] = [];

  for (const token of tokens) {
    const variants = QUERY_EXPANSIONS[token] || [token];
    const matchedFields = Object.entries(fields).filter(([, value]) =>
      variants.some((variant) => value.includes(normalizeText(variant))),
    );
    if (!matchedFields.length) continue;

    const fieldNames = matchedFields.map(([field]) => field);
    if (fieldNames.includes('title')) score += 5;
    if (fieldNames.includes('company')) score += 3;
    if (fieldNames.includes('location')) score += 3;
    if (fieldNames.includes('portal')) score += 2;
    if (fieldNames.includes('snippet')) score += 1;
    hits.push(token);
  }

  return { score, hits: Array.from(new Set(hits)) };
}

function buildLocalSearchResults(query: string, scoredJobs: any[], limit = 50): SearchMatch[] {
  return scoredJobs
    .map((job) => {
      const id = Number(job?.id ?? job?.scoredJob?.id ?? job?.scored_jobs?.id);
      const local = scoreLocalMatch(query, job);
      return { id, localScore: local.score, baseScore: jobScore(job), hits: local.hits };
    })
    .filter((item) => Number.isFinite(item.id) && item.localScore > 0)
    .sort((a, b) => b.localScore - a.localScore || b.baseScore - a.baseScore)
    .slice(0, limit)
    .map((item) => ({
      id: item.id,
      score: item.localScore,
      source: 'local' as const,
      reason: item.hits.length
        ? `Matched ${item.hits.slice(0, 4).join(', ')} in the local job index.`
        : 'Kept because it is already highly ranked for the active profile.',
    }));
}

async function buildIndexedSearchResults(query: string, scoredJobs: any[], limit = 50): Promise<SearchMatch[]> {
  const jobs = scoredJobs
    .map(toSearchableJob)
    .filter((job) => Number.isFinite(Number(job.id)) && job.title && job.company);
  if (!jobs.length) return [];

  const result = await searchJobs({
    q: query,
    jobs,
    limit,
    sort: 'relevance:desc',
  }, { timeoutMs: 650 });

  return result.hits
    .map((hit) => ({
      id: Number(hit.id),
      score: hit.score ?? undefined,
      source: result.metadata.backend,
      reason: result.metadata.backend === 'meilisearch'
        ? 'Matched in the local Meilisearch job index.'
        : 'Matched in the local job index.',
    }))
    .filter((match) => Number.isFinite(match.id));
}

function hasExplicitAIProvider(env: Record<string, string | undefined>, config: ReturnType<typeof getAppConfig>) {
  const providers = discoverAIProviderConfigs(env);
  return providers.some((provider) => {
    if (!provider.enabled) return false;
    if (provider.requiresApiKey) return Boolean(provider.apiKey?.trim());
    if (provider.provider === 'ollama') {
      return config.aiProvider === 'ollama' || env.CAREER_SEEK_ENABLE_OLLAMA === '1' || Boolean(env.OLLAMA_BASE_URL?.trim());
    }
    return Boolean(provider.baseUrl?.trim());
  });
}

function persistSearch(query: string, results: SearchMatch[]) {
  const db = getDb();
  db.insert(searchQueries).values({
    query,
    results: JSON.stringify(results),
    timestamp: new Date(),
  }).run();
}

function applyAiReasons(parsed: unknown, localResults: SearchMatch[]) {
  if (!Array.isArray(parsed)) return localResults;
  const localById = new Map(localResults.map((result) => [result.id, result]));
  const reasonById = new Map<number, string>();

  for (const item of parsed) {
    const id = Number(item?.id);
    const reason = String(item?.reason || '').trim();
    if (Number.isFinite(id) && reason && localById.has(id)) {
      reasonById.set(id, reason);
    }
  }

  return localResults.map((result) => {
    const reason = reasonById.get(result.id);
    return reason ? { ...result, reason, source: 'ai' as const } : result;
  });
}

export async function executeAiSearch(query: string, scoredJobs: any[]): Promise<SearchMatch[]> {
  const indexedResults = await buildIndexedSearchResults(query, scoredJobs);
  const localResults = indexedResults.length ? indexedResults : buildLocalSearchResults(query, scoredJobs);
  if (!localResults.length) {
    persistSearch(query, []);
    return [];
  }

  const config = getAppConfig();
  const env = getAIRuntimeEnv(config);
  if (!hasExplicitAIProvider(env, config)) {
    persistSearch(query, localResults);
    return localResults;
  }

  // To save tokens, we only send an ID and a brief summary of the top scored jobs.
  const localIds = new Set(localResults.map((result) => result.id));
  const jobsContext = scoredJobs
    .filter((job) => localIds.has(Number(job?.id ?? job?.scoredJob?.id ?? job?.scored_jobs?.id)))
    .slice(0, 50)
    .map(j => ({
      id: Number(j.id ?? j.scoredJob?.id ?? j.scored_jobs?.id),
      title: jobValue(j, 'title'),
      company: jobValue(j, 'company'),
      snippet: jobValue(j, 'snippet'),
      tier: j.tier ?? j.scoredJob?.tier ?? j.scored_jobs?.tier,
      location: jobValue(j, 'location'),
      localReason: localResults.find((result) => result.id === Number(j.id ?? j.scoredJob?.id ?? j.scored_jobs?.id))?.reason,
    }));

  const prompt = `
  The user is querying their local job database.
  The local matcher has already selected the only jobs you may return.
  Improve the reason text, but keep the local ranking and do not introduce new IDs.

  Query: "${query}"

  Here are the candidate jobs (ID, Title, Company, Location, Tier, Snippet):
  ${JSON.stringify(jobsContext)}

  Return a strict JSON array of objects, containing the supplied job IDs that match the query and a brief 1-sentence reason why.
  Preserve the supplied order.
  Format:
  [
    { "id": number, "reason": "string" }
  ]
  `;

  try {
    const response = await getAIManager({ env }).generate<Array<{ id: number; reason: string }>>({
      provider: config.aiProvider,
      model: config.aiModel,
      systemPrompt: 'You interpret local job-search results. You may only return job IDs that are present in the supplied candidate list.',
      userPrompt: prompt,
      temperature: 0.1,
      maxTokens: 900,
      responseFormat: 'json',
      metadata: {
        task: 'job_search_interpretation',
        candidateCount: jobsContext.length,
      },
    });
    const merged = applyAiReasons(response.parsed, localResults);
    persistSearch(query, merged);
    return merged;
  } catch (error) {
    console.error("AI search interpretation failed; using local results:", error);
    persistSearch(query, localResults);
    return localResults;
  }
}
