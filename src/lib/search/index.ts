import {
  addMeiliJobDocuments,
  assertMeiliReachable,
  ensureMeiliJobIndex,
  resolveSearchOptions,
  searchMeiliJobs,
} from './client';
import {
  buildMeiliFilter,
  cacheLocalJobs,
  normalizeJobDocument,
  searchLocalJobs,
  toMeiliSort,
} from './local';
import type {
  EnsureJobIndexResult,
  IndexedJobDocument,
  IndexJobsResult,
  JobSearchOptions,
  JobSearchQuery,
  SearchJobsResult,
  SearchOperationMetadata,
  SearchableJob,
} from './types';

export type {
  EnsureJobIndexResult,
  IndexedJobDocument,
  IndexJobsResult,
  JobSearchFilters,
  JobSearchOptions,
  JobSearchQuery,
  SearchBackend,
  SearchFallbackMetadata,
  SearchJobsResult,
  SearchOperationMetadata,
  SearchableJob,
  SearchSort,
} from './types';

export async function ensureJobIndex(options: JobSearchOptions = {}): Promise<EnsureJobIndexResult> {
  const startedAt = Date.now();
  const resolved = resolveSearchOptions(options);

  try {
    const ready = await ensureMeiliJobIndex(resolved);
    return {
      ok: true,
      metadata: metadata('meilisearch', ready.indexName, startedAt),
    };
  } catch (error) {
    return {
      ok: true,
      metadata: metadata('local', resolved.indexName, startedAt, fallbackReason(error, resolved.host), resolved.host),
      error: errorMessage(error),
    };
  }
}

export async function indexJobs(
  jobs: SearchableJob[],
  options: JobSearchOptions = {},
): Promise<IndexJobsResult> {
  const startedAt = Date.now();
  const resolved = resolveSearchOptions(options);
  const documents = jobs.map(normalizeJobDocument);

  try {
    const { taskUid, resolved: ready } = await addMeiliJobDocuments(documents, resolved);
    return {
      ok: true,
      indexedCount: documents.length,
      taskUid,
      metadata: metadata('meilisearch', ready.indexName, startedAt),
    };
  } catch (error) {
    cacheLocalJobs(jobs);
    return {
      ok: true,
      indexedCount: documents.length,
      metadata: metadata('local', resolved.indexName, startedAt, fallbackReason(error, resolved.host), resolved.host),
      error: errorMessage(error),
    };
  }
}

export async function searchJobs(
  query: JobSearchQuery = {},
  options: JobSearchOptions = {},
): Promise<SearchJobsResult> {
  const startedAt = Date.now();
  const resolved = resolveSearchOptions(options);
  const limit = clampLimit(query.limit);
  const offset = Math.max(0, query.offset ?? 0);

  try {
    await assertMeiliReachable(resolved);
    const { result, resolved: ready } = await searchMeiliJobsWithQuery(query, {
      ...resolved,
      indexName: resolved.indexName,
    }, limit, offset);
    return {
      hits: result.hits ?? [],
      estimatedTotalHits: result.estimatedTotalHits ?? result.nbHits ?? result.hits?.length ?? 0,
      limit: result.limit ?? limit,
      offset: result.offset ?? offset,
      processingTimeMs: result.processingTimeMs ?? Date.now() - startedAt,
      metadata: metadata('meilisearch', ready.indexName, startedAt),
    };
  } catch (error) {
    const local = searchLocalJobs({ ...query, limit, offset });
    return {
      ...local,
      metadata: metadata('local', resolved.indexName, startedAt, fallbackReason(error, resolved.host), resolved.host),
      error: errorMessage(error),
    };
  }
}

async function searchMeiliJobsWithQuery(
  query: JobSearchQuery,
  options: JobSearchOptions,
  limit: number,
  offset: number,
) {
  return searchMeiliJobs({
    q: query.q ?? '',
    limit,
    offset,
    filter: buildMeiliFilter(query.filters),
    sort: toMeiliSort(query.sort),
  }, options);
}

function metadata(
  backend: SearchOperationMetadata['backend'],
  indexName: string,
  startedAt: number,
  reason?: string,
  attemptedHost?: string,
): SearchOperationMetadata {
  return {
    backend,
    indexName,
    durationMs: Date.now() - startedAt,
    fallback: {
      active: backend === 'local',
      reason,
      attemptedHost,
      checkedAt: new Date().toISOString(),
    },
  };
}

function fallbackReason(error: unknown, host?: string) {
  if (!host) return 'MEILI_HOST is not configured; using local in-process filtering';
  return `Meilisearch unavailable at ${host}: ${errorMessage(error)}`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function clampLimit(limit = 20) {
  return Math.min(Math.max(limit, 1), 100);
}

export function createLocalJobDocuments(jobs: SearchableJob[]): IndexedJobDocument[] {
  return jobs.map(normalizeJobDocument);
}
