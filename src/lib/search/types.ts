export type SearchBackend = 'meilisearch' | 'local';

export type SearchSort =
  | 'relevance:desc'
  | 'score:desc'
  | 'score:asc'
  | 'postedDate:desc'
  | 'postedDate:asc'
  | 'scrapedAt:desc'
  | 'scrapedAt:asc';

export interface SearchableJob {
  id: string | number;
  title: string;
  company: string;
  location?: string | null;
  portal?: string | null;
  url?: string | null;
  applyUrl?: string | null;
  snippet?: string | null;
  employmentType?: string | null;
  isRemote?: boolean | null;
  isHybrid?: boolean | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  experienceMin?: number | null;
  experienceMax?: number | null;
  postedDate?: Date | string | null;
  scrapedAt?: Date | string | null;
  score?: number | null;
  tier?: string | null;
  keywords?: string[] | null;
  positiveFactors?: string[] | null;
  negativeFactors?: string[] | null;
  warnings?: string[] | null;
  rawPayload?: unknown;
}

export interface IndexedJobDocument extends Omit<SearchableJob, 'id' | 'postedDate' | 'scrapedAt'> {
  id: string;
  postedDate?: string | null;
  scrapedAt?: string | null;
  searchText: string;
}

export interface JobSearchFilters {
  company?: string;
  location?: string;
  portal?: string;
  tier?: string;
  remote?: boolean;
  hybrid?: boolean;
  minScore?: number;
  salaryMin?: number;
  experienceMin?: number;
  experienceMax?: number;
  postedAfter?: Date | string;
  postedBefore?: Date | string;
}

export interface JobSearchQuery {
  q?: string;
  filters?: JobSearchFilters;
  limit?: number;
  offset?: number;
  sort?: SearchSort;
  jobs?: SearchableJob[];
}

export interface JobSearchOptions {
  host?: string;
  apiKey?: string;
  indexName?: string;
  timeoutMs?: number;
}

export interface SearchFallbackMetadata {
  active: boolean;
  reason?: string;
  attemptedHost?: string;
  checkedAt: string;
}

export interface SearchOperationMetadata {
  backend: SearchBackend;
  indexName: string;
  durationMs: number;
  fallback: SearchFallbackMetadata;
}

export interface EnsureJobIndexResult {
  ok: boolean;
  metadata: SearchOperationMetadata;
  error?: string;
}

export interface IndexJobsResult {
  ok: boolean;
  indexedCount: number;
  metadata: SearchOperationMetadata;
  taskUid?: number;
  error?: string;
}

export interface SearchJobsResult<TJob extends IndexedJobDocument = IndexedJobDocument> {
  hits: TJob[];
  estimatedTotalHits: number;
  limit: number;
  offset: number;
  processingTimeMs: number;
  metadata: SearchOperationMetadata;
  error?: string;
}

export interface MeiliSearchResponse {
  hits: IndexedJobDocument[];
  estimatedTotalHits?: number;
  nbHits?: number;
  limit?: number;
  offset?: number;
  processingTimeMs?: number;
}
