import type {
  IndexedJobDocument,
  JobSearchFilters,
  JobSearchQuery,
  SearchableJob,
  SearchSort,
} from './types';

const STOP_WORDS = new Set(['and', 'the', 'for', 'with', 'from', 'this', 'that', 'job', 'jobs', 'role']);
const memoryJobs = new Map<string, IndexedJobDocument>();

export function normalizeJobDocument(job: SearchableJob): IndexedJobDocument {
  const id = String(job.id);
  const postedDate = normalizeDate(job.postedDate);
  const scrapedAt = normalizeDate(job.scrapedAt);
  const keywords = Array.isArray(job.keywords) ? job.keywords.filter(Boolean) : [];
  const searchText = normalizeText([
    job.title,
    job.company,
    job.location,
    job.portal,
    job.snippet,
    job.employmentType,
    job.tier,
    keywords.join(' '),
    job.positiveFactors?.join(' '),
  ].filter(Boolean).join(' '));

  return {
    ...job,
    id,
    postedDate,
    scrapedAt,
    keywords,
    searchText,
  };
}

export function cacheLocalJobs(jobs: SearchableJob[]) {
  const documents = jobs.map(normalizeJobDocument);
  for (const document of documents) {
    memoryJobs.set(document.id, document);
  }
  return documents;
}

export function getCachedLocalJobs() {
  return Array.from(memoryJobs.values());
}

export function searchLocalJobs(query: JobSearchQuery) {
  const startedAt = Date.now();
  const limit = clampLimit(query.limit);
  const offset = Math.max(0, query.offset ?? 0);
  const documents = query.jobs?.length
    ? query.jobs.map(normalizeJobDocument)
    : getCachedLocalJobs();
  const terms = tokenize(query.q);

  const ranked = documents
    .filter((job) => matchesFilters(job, query.filters))
    .map((job) => ({
      job,
      relevance: scoreLocalRelevance(job, terms),
    }))
    .filter((result) => terms.length === 0 || result.relevance > 0)
    .sort(sortLocalResults(query.sort, terms.length > 0));

  return {
    hits: ranked.slice(offset, offset + limit).map((result) => result.job),
    estimatedTotalHits: ranked.length,
    limit,
    offset,
    processingTimeMs: Date.now() - startedAt,
  };
}

export function buildMeiliFilter(filters?: JobSearchFilters) {
  if (!filters) return undefined;

  const clauses: string[] = [];
  if (filters.company) clauses.push(`company = ${quoteFilter(filters.company)}`);
  if (filters.location) clauses.push(`location = ${quoteFilter(filters.location)}`);
  if (filters.portal) clauses.push(`portal = ${quoteFilter(filters.portal)}`);
  if (filters.tier) clauses.push(`tier = ${quoteFilter(filters.tier)}`);
  if (typeof filters.remote === 'boolean') clauses.push(`isRemote = ${filters.remote}`);
  if (typeof filters.hybrid === 'boolean') clauses.push(`isHybrid = ${filters.hybrid}`);
  if (typeof filters.minScore === 'number') clauses.push(`score >= ${filters.minScore}`);
  if (typeof filters.salaryMin === 'number') clauses.push(`salaryMax >= ${filters.salaryMin}`);
  if (typeof filters.experienceMin === 'number') clauses.push(`experienceMax >= ${filters.experienceMin}`);
  if (typeof filters.experienceMax === 'number') clauses.push(`experienceMin <= ${filters.experienceMax}`);

  const postedAfter = normalizeDate(filters.postedAfter);
  const postedBefore = normalizeDate(filters.postedBefore);
  if (postedAfter) clauses.push(`postedDate >= ${quoteFilter(postedAfter)}`);
  if (postedBefore) clauses.push(`postedDate <= ${quoteFilter(postedBefore)}`);

  return clauses.length > 0 ? clauses.join(' AND ') : undefined;
}

export function toMeiliSort(sort?: SearchSort) {
  if (!sort || sort === 'relevance:desc') return undefined;
  return [sort];
}

function matchesFilters(job: IndexedJobDocument, filters?: JobSearchFilters) {
  if (!filters) return true;
  if (filters.company && !includesText(job.company, filters.company)) return false;
  if (filters.location && !includesText(job.location, filters.location)) return false;
  if (filters.portal && !equalsText(job.portal, filters.portal)) return false;
  if (filters.tier && !equalsText(job.tier, filters.tier)) return false;
  if (typeof filters.remote === 'boolean' && Boolean(job.isRemote) !== filters.remote) return false;
  if (typeof filters.hybrid === 'boolean' && Boolean(job.isHybrid) !== filters.hybrid) return false;
  if (typeof filters.minScore === 'number' && (job.score ?? 0) < filters.minScore) return false;
  if (typeof filters.salaryMin === 'number' && (job.salaryMax ?? job.salaryMin ?? 0) < filters.salaryMin) return false;
  if (typeof filters.experienceMin === 'number' && (job.experienceMax ?? job.experienceMin ?? 0) < filters.experienceMin) return false;
  if (typeof filters.experienceMax === 'number' && (job.experienceMin ?? job.experienceMax ?? 999) > filters.experienceMax) return false;
  if (filters.postedAfter && compareDate(job.postedDate, filters.postedAfter) < 0) return false;
  if (filters.postedBefore && compareDate(job.postedDate, filters.postedBefore) > 0) return false;
  return true;
}

function scoreLocalRelevance(job: IndexedJobDocument, terms: string[]) {
  if (terms.length === 0) return 1;

  let relevance = 0;
  const title = normalizeText(job.title);
  const company = normalizeText(job.company);
  const location = normalizeText(job.location);

  for (const term of terms) {
    if (title.includes(term)) relevance += 8;
    if (company.includes(term)) relevance += 4;
    if (location.includes(term)) relevance += 2;
    if (job.searchText.includes(term)) relevance += 1;
  }

  return relevance + ((job.score ?? 0) / 100);
}

function sortLocalResults(sort: SearchSort | undefined, hasQuery: boolean) {
  return (left: { job: IndexedJobDocument; relevance: number }, right: { job: IndexedJobDocument; relevance: number }) => {
    if (!sort || sort === 'relevance:desc') {
      const relevanceDelta = hasQuery ? right.relevance - left.relevance : 0;
      return relevanceDelta || numericDesc(left.job.score, right.job.score) || dateDesc(left.job.postedDate, right.job.postedDate);
    }

    if (sort === 'score:desc') return numericDesc(left.job.score, right.job.score);
    if (sort === 'score:asc') return numericAsc(left.job.score, right.job.score);
    if (sort === 'postedDate:desc') return dateDesc(left.job.postedDate, right.job.postedDate);
    if (sort === 'postedDate:asc') return dateAsc(left.job.postedDate, right.job.postedDate);
    if (sort === 'scrapedAt:desc') return dateDesc(left.job.scrapedAt, right.job.scrapedAt);
    if (sort === 'scrapedAt:asc') return dateAsc(left.job.scrapedAt, right.job.scrapedAt);
    return 0;
  };
}

function normalizeText(value: unknown) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value: unknown) {
  return normalizeText(value)
    .split(' ')
    .filter((term) => term.length > 1 && !STOP_WORDS.has(term));
}

function normalizeDate(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function compareDate(left: unknown, right: unknown) {
  return dateValue(left) - dateValue(right);
}

function dateValue(value: unknown) {
  const normalized = normalizeDate(value);
  return normalized ? new Date(normalized).getTime() : 0;
}

function dateDesc(left: unknown, right: unknown) {
  return dateValue(right) - dateValue(left);
}

function dateAsc(left: unknown, right: unknown) {
  return dateValue(left) - dateValue(right);
}

function numericDesc(left?: number | null, right?: number | null) {
  return (right ?? Number.NEGATIVE_INFINITY) - (left ?? Number.NEGATIVE_INFINITY);
}

function numericAsc(left?: number | null, right?: number | null) {
  return (left ?? Number.POSITIVE_INFINITY) - (right ?? Number.POSITIVE_INFINITY);
}

function includesText(value: unknown, expected: string) {
  return normalizeText(value).includes(normalizeText(expected));
}

function equalsText(value: unknown, expected: string) {
  return normalizeText(value) === normalizeText(expected);
}

function clampLimit(limit = 20) {
  return Math.min(Math.max(limit, 1), 100);
}

function quoteFilter(value: string) {
  return JSON.stringify(value);
}
