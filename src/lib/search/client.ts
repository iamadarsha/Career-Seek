import type {
  IndexedJobDocument,
  JobSearchOptions,
  MeiliSearchResponse,
} from './types';

export const DEFAULT_JOB_INDEX = 'career_seek_jobs';
const DEFAULT_TIMEOUT_MS = 900;

interface RequestOptions extends JobSearchOptions {
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
}

export class MeiliUnavailableError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'MeiliUnavailableError';
  }
}

export function resolveSearchOptions(options: JobSearchOptions = {}) {
  return {
    host: trimTrailingSlash(options.host ?? process.env.MEILI_HOST ?? process.env.MEILISEARCH_URL ?? ''),
    apiKey: options.apiKey ?? process.env.MEILI_MASTER_KEY ?? process.env.MEILI_API_KEY,
    indexName: options.indexName ?? process.env.MEILI_JOB_INDEX ?? DEFAULT_JOB_INDEX,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  };
}

export async function assertMeiliReachable(options: JobSearchOptions = {}) {
  const resolved = resolveSearchOptions(options);
  if (!resolved.host) {
    throw new MeiliUnavailableError('MEILI_HOST is not configured');
  }

  await meiliRequest('/health', {
    ...resolved,
    method: 'GET',
  });

  return resolved;
}

export async function ensureMeiliJobIndex(options: JobSearchOptions = {}) {
  const resolved = await assertMeiliReachable(options);
  const indexPath = `/indexes/${encodeURIComponent(resolved.indexName)}`;

  try {
    await meiliRequest(indexPath, {
      ...resolved,
      method: 'GET',
    });
  } catch (error) {
    if (!isMissingIndexError(error)) throw error;
    await meiliRequest('/indexes', {
      ...resolved,
      method: 'POST',
      body: {
        uid: resolved.indexName,
        primaryKey: 'id',
      },
    });
  }

  await meiliRequest(`${indexPath}/settings`, {
    ...resolved,
    method: 'PATCH',
    body: {
      searchableAttributes: ['title', 'company', 'location', 'snippet', 'keywords', 'searchText'],
      filterableAttributes: [
        'company',
        'location',
        'portal',
        'tier',
        'isRemote',
        'isHybrid',
        'score',
        'salaryMin',
        'salaryMax',
        'experienceMin',
        'experienceMax',
        'postedDate',
      ],
      sortableAttributes: ['score', 'postedDate', 'scrapedAt'],
      displayedAttributes: ['*'],
      rankingRules: ['words', 'typo', 'proximity', 'attribute', 'sort', 'exactness'],
    },
  });

  return resolved;
}

export async function addMeiliJobDocuments(documents: IndexedJobDocument[], options: JobSearchOptions = {}) {
  const resolved = await ensureMeiliJobIndex(options);
  const task = await meiliRequest<{ taskUid?: number; uid?: number }>(
    `/indexes/${encodeURIComponent(resolved.indexName)}/documents?primaryKey=id`,
    {
      ...resolved,
      method: 'POST',
      body: documents,
    },
  );

  return {
    taskUid: task.taskUid ?? task.uid,
    resolved,
  };
}

export async function searchMeiliJobs(
  body: {
    q: string;
    limit: number;
    offset: number;
    filter?: string;
    sort?: string[];
  },
  options: JobSearchOptions = {},
) {
  const resolved = await assertMeiliReachable(options);
  const result = await meiliRequest<MeiliSearchResponse>(
    `/indexes/${encodeURIComponent(resolved.indexName)}/search`,
    {
      ...resolved,
      method: 'POST',
      body,
    },
  );

  return {
    result,
    resolved,
  };
}

async function meiliRequest<T = unknown>(path: string, options: RequestOptions): Promise<T> {
  const resolved = resolveSearchOptions(options);
  if (!resolved.host) {
    throw new MeiliUnavailableError('MEILI_HOST is not configured');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), resolved.timeoutMs);

  try {
    const response = await fetch(`${resolved.host}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(resolved.apiKey ? { Authorization: `Bearer ${resolved.apiKey}` } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });

    const text = await response.text();
    const parsed = text ? JSON.parse(text) : {};

    if (!response.ok) {
      const message = typeof parsed?.message === 'string'
        ? parsed.message
        : `Meilisearch request failed with ${response.status}`;
      const error = new MeiliUnavailableError(message);
      Object.assign(error, { status: response.status, code: parsed?.code });
      throw error;
    }

    return parsed as T;
  } catch (error) {
    if (error instanceof MeiliUnavailableError) throw error;
    const message = error instanceof Error ? error.message : 'Unknown Meilisearch connection error';
    throw new MeiliUnavailableError(message, error);
  } finally {
    clearTimeout(timeout);
  }
}

function isMissingIndexError(error: unknown) {
  return typeof error === 'object'
    && error !== null
    && ('status' in error)
    && (error as { status?: number }).status === 404;
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}
