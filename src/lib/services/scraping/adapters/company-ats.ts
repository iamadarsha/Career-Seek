import { BrowserContext } from 'playwright';
import { type AtsType, companySourcesForRoleFamilies, type CompanyCareerSource } from '../company-careers-map';
import { inferRoleFamilies } from '../role-family-packs';
import { JobQuery, PortalScanResult, RawScrapedJob } from '../types';
import { BasePortalAdapter } from './base';
import { ADDITIONAL_ATS_EXTRACTORS } from './ats-public-extractors';
import { sourceCapabilities } from '../source-universe';
import { waitForCompanyCareerDomainSlot } from '../rate-limiter';

const COMPANY_ATS_CAPABILITIES = sourceCapabilities('company_ats');
const DEFAULT_COMPANY_ATS_SOURCE_LIMIT = 40;
const DEFAULT_COMPANY_ATS_JOB_CAP = 90;
const DEFAULT_COMPANY_ATS_JOBS_PER_COMPANY = 5;
const COMPANY_ATS_RETRY_COMPANIES = new Set([
  'adobe',
  'basf',
  'bharat electronics',
  'canara bank',
  'cred',
  "dr. reddy's",
  'dr reddys',
  'hdfc life',
  'microsoft',
  'ntpc',
  'oracle',
  'sun pharma',
]);

const CAREER_FETCH_PROFILES = [
  {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    acceptLanguage: 'en-IN,en;q=0.9',
    viewport: { width: 1366, height: 900 },
  },
  {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    acceptLanguage: 'en-IN,en-US;q=0.9,en;q=0.8',
    viewport: { width: 1440, height: 940 },
  },
  {
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36',
    acceptLanguage: 'en-GB,en-IN;q=0.9,en;q=0.8',
    viewport: { width: 1280, height: 860 },
  },
];

const ATS_URL_PATTERNS: Array<{ atsType: AtsType; patterns: RegExp[] }> = [
  { atsType: 'greenhouse', patterns: [/greenhouse\.io/i, /job-boards\.greenhouse\.io/i, /boards\.greenhouse\.io/i] },
  { atsType: 'lever', patterns: [/jobs\.lever\.co/i, /api\.lever\.co/i] },
  { atsType: 'workday', patterns: [/workdayjobs\.com/i, /myworkdayjobs\.com/i, /\.wd\d+\.myworkdayjobs\.com/i] },
  { atsType: 'ashby', patterns: [/ashbyhq\.com/i, /jobs\.ashbyhq\.com/i] },
  { atsType: 'rippling', patterns: [/rippling\.com\/careers/i, /ats\.rippling\.com/i] },
  { atsType: 'bamboohr', patterns: [/bamboohr\.com\/jobs/i, /apply\.bamboohr\.com/i] },
  { atsType: 'icims', patterns: [/icims\.com/i, /icimscloud\.com/i] },
  { atsType: 'successfactors', patterns: [/successfactors\.(?:com|eu)/i, /sapsf\.(?:com|eu)/i, /sfcareer/i, /jobreqcareer/i] },
  { atsType: 'smartrecruiters', patterns: [/smartrecruiters\.com/i] },
];

export function classifyAtsTypeFromUrl(value: string): AtsType {
  const normalized = String(value || '').trim();
  if (!normalized) return 'unknown_or_custom';

  for (const classifier of ATS_URL_PATTERNS) {
    if (classifier.patterns.some((pattern) => pattern.test(normalized))) {
      return classifier.atsType;
    }
  }

  return /\/(careers?|jobs?|positions?|openings?)(\/|$|\?|#)/i.test(normalized) ? 'custom' : 'unknown_or_custom';
}

function effectiveAtsType(source: CompanyCareerSource): AtsType {
  if (source.atsType !== 'custom' && source.atsType !== 'unknown_or_custom') {
    return source.atsType;
  }

  const inferred = classifyAtsTypeFromUrl(source.careersUrl);
  return inferred === 'unknown_or_custom' ? source.atsType : inferred;
}

function sourceErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cappedPositiveInt(raw: string | undefined, fallback: number, max: number) {
  const parsed = Number(raw || fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function retryWeightForSource(source: CompanyCareerSource) {
  const normalized = source.company.toLowerCase().replace(/\s+/g, ' ').trim();
  return COMPANY_ATS_RETRY_COMPANIES.has(normalized) ? 2 : 0;
}

function careerProfileFor(source: CompanyCareerSource, attempt = 0) {
  const seed = source.company.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return CAREER_FETCH_PROFILES[(seed + attempt) % CAREER_FETCH_PROFILES.length];
}

function timeoutSignal(ms: number) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }

  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

function resilientHeaders(source: CompanyCareerSource, attempt = 0, extra?: HeadersInit): HeadersInit {
  const profile = careerProfileFor(source, attempt);
  return {
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7',
    'accept-language': profile.acceptLanguage,
    'cache-control': 'no-cache',
    'pragma': 'no-cache',
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'none',
    'upgrade-insecure-requests': '1',
    'user-agent': profile.userAgent,
    ...(extra || {}),
  };
}

async function fetchWithRetries(
  source: CompanyCareerSource,
  url: string,
  init: RequestInit = {},
  options: { timeoutMs?: number; retries?: number; json?: boolean } = {},
) {
  const retries = options.retries ?? retryWeightForSource(source);
  const timeoutMs = options.timeoutMs ?? 12000;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        headers: resilientHeaders(source, attempt, init.headers),
        signal: timeoutSignal(timeoutMs + attempt * 4000),
      });
      if (response.ok) return response;

      const retryable = [408, 425, 429, 500, 502, 503, 504].includes(response.status);
      const error = new Error(`${response.status} ${response.statusText || 'HTTP error'} from ${new URL(url).hostname}`);
      if (!retryable || attempt >= retries) throw error;
      lastError = error;
    } catch (error) {
      lastError = error;
      if (attempt >= retries) break;
    }
    await sleep(700 + attempt * 900);
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError || 'fetch failed'));
}

function companyCareerSourcePayload(source: CompanyCareerSource, atsType: AtsType) {
  return {
    company: source.company,
    careersUrl: source.careersUrl,
    atsType,
    configuredAtsType: source.atsType,
    sectors: source.sectors,
    roleFamilies: source.roleFamilies,
    cityHints: source.cityHints,
    remoteRelevance: source.remoteRelevance,
  };
}

function attachCompanyCareerProof(job: RawScrapedJob, source: CompanyCareerSource, atsType: AtsType): RawScrapedJob {
  return {
    ...job,
    portal: 'company_ats',
    rawPayload: {
      ...(job.rawPayload || {}),
      sourceCapabilities: COMPANY_ATS_CAPABILITIES,
      companyCareerSource: companyCareerSourcePayload(source, atsType),
    },
  };
}

function atsHrefIncludes(source: CompanyCareerSource) {
  const includes = [
    '/jobs/',
    '/job/',
    '/careers',
    '/career',
    '/positions',
    '/position',
    '/openings',
    '/opening',
    '/requisition',
    'requisition',
    'jobdetails',
    '/details/',
    '/results',
    'open-positions',
  ];
  const atsType = effectiveAtsType(source);
  if (atsType === 'greenhouse') includes.push('greenhouse.io', 'job-boards.greenhouse.io', 'boards.greenhouse.io');
  if (atsType === 'lever') includes.push('jobs.lever.co');
  if (atsType === 'ashby') includes.push('ashbyhq.com', 'jobs.ashbyhq.com');
  if (atsType === 'workday') includes.push('workdayjobs.com', 'myworkdayjobs.com');
  if (atsType === 'bamboohr') includes.push('bamboohr.com/jobs', 'apply.bamboohr.com');
  if (atsType === 'rippling') includes.push('rippling.com/careers', 'ats.rippling.com');
  if (atsType === 'icims') includes.push('icims.com/jobs', 'icims.com/careers', 'icimscloud.com');
  if (atsType === 'successfactors') includes.push('successfactors.com', 'successfactors.eu', 'sapsf.com', 'sapsf.eu', 'jobreqcareer');
  if (atsType === 'smartrecruiters') includes.push('jobs.smartrecruiters.com', 'careers.smartrecruiters.com');
  try {
    includes.push(new URL(source.careersUrl).hostname.replace(/^www\./, ''));
  } catch {
    // Keep the generic includes if the URL is malformed.
  }
  return includes;
}

function companyLimit() {
  return cappedPositiveInt(process.env.JOBHUNT_COMPANY_SOURCE_LIMIT, DEFAULT_COMPANY_ATS_SOURCE_LIMIT, 120);
}

function jobCap() {
  return cappedPositiveInt(process.env.JOBHUNT_COMPANY_ATS_JOB_CAP, DEFAULT_COMPANY_ATS_JOB_CAP, 200);
}

function jobsPerCompanyCap() {
  return cappedPositiveInt(process.env.JOBHUNT_COMPANY_ATS_JOBS_PER_COMPANY, DEFAULT_COMPANY_ATS_JOBS_PER_COMPANY, 12);
}

function stripHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtml(value: string) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"');
}

function atsSlug(source: CompanyCareerSource, hostPart: string) {
  try {
    const url = new URL(source.careersUrl);
    if (!url.hostname.includes(hostPart)) return null;
    return url.pathname.split('/').filter(Boolean)[0] || null;
  } catch {
    return null;
  }
}

function isPlausibleCareerTitle(job: RawScrapedJob, query: JobQuery) {
  const title = job.title.toLowerCase();
  const url = job.url.toLowerCase();
  const haystack = `${job.title} ${job.url} ${job.snippet || ''}`.toLowerCase();
  const roleTerms = query.titleVariants
    .flatMap((variant) => variant.toLowerCase().split(/[^a-z0-9]+/))
    .filter((term) => term.length > 2 && !['and', 'the', 'for'].includes(term));
  const hasRoleSignal = roleTerms.some((term) => haystack.includes(term));
  const isNavigation = /^(skip|main content|careers|jobs|search|search jobs|life at|about|benefits|teams|locations|students|graduates|reset|clear|filter|view all|my career|search results|join our talent community|manage preferences|learning and development|business sector|how we hire)$/i.test(job.title.trim());
  const isNavigationUrl = /(?:#reset|#search|\/(?:our-teams|teams|life-at|students|university|benefits|locations|about|blog|events)\/)/i.test(url);
  const isPolicy = /privacy|terms|cookie|accessibility|equal opportunity|fraud|recruitment process|talent community|interview questions|explore courses/i.test(title) || /privacy|terms|cookie|recruitment process|interview questions/.test(haystack);
  const isProductSearch = query.titleVariants.some((variant) => /product|program manager|product owner|\bpm\b/i.test(variant));
  const isDesignSearch = query.titleVariants.some((variant) => /\bux\b|\bui\b|designer|product design|interaction design|research/i.test(variant));
  const isComplianceSearch = query.titleVariants.some((variant) => /compliance|aml|kyc|financial crime|sanctions|transaction monitoring|regulatory/i.test(variant));
  const isBackendSearch = query.titleVariants.some((variant) => /backend|java|spring/i.test(variant));
  const productTitleLooksUseful = !isProductSearch || (
    /\b(product|program)\b/i.test(haystack) &&
    !/\b(account executive|account manager|sales|alliance|alliances|business development|partner|customer success|revenue)\b/i.test(haystack)
  );
  const designTitleLooksUseful = !isDesignSearch || /\b(designer|design|ux|ui|researcher|research|interaction)\b/i.test(haystack);
  const complianceTitleLooksUseful = !isComplianceSearch || /\b(compliance|aml|kyc|financial crime|sanction|regulatory|risk|transaction monitoring|cdd|edd|fraud|due diligence|screening|alert review|investigation|officer|analyst)\b/i.test(haystack);
  const backendTitleLooksUseful = !isBackendSearch || (/\b(backend|java|spring|api|platform)\b/i.test(haystack) && /\b(engineer|developer|architect|programmer)\b/i.test(haystack));
  const identicalSnippet = String(job.snippet || '').trim().toLowerCase() === title;
  const keywordSoup = /data analyticsdata analytics|data engineeringdata engineering|teacher jobs \d+ openings|interview questions/i.test(haystack);
  return hasRoleSignal &&
    productTitleLooksUseful &&
    designTitleLooksUseful &&
    complianceTitleLooksUseful &&
    backendTitleLooksUseful &&
    !isNavigation &&
    !isNavigationUrl &&
    !isPolicy &&
    !identicalSnippet &&
    !keywordSoup;
}

function roleTermsForQuery(query: JobQuery) {
  return [
    ...query.titleVariants,
    ...(query.keywords || []),
  ]
    .flatMap((variant) => String(variant).toLowerCase().split(/[^a-z0-9+#.]+/))
    .map((term) => term.trim())
    .filter((term) => term.length > 2 && !['and', 'the', 'for', 'with', 'from', 'role', 'jobs'].includes(term));
}

function decodeCareerHref(rawHref: string, baseUrl: string) {
  const cleaned = decodeHtml(rawHref).trim();
  if (!cleaned || cleaned.startsWith('javascript:') || cleaned.startsWith('mailto:') || cleaned.startsWith('tel:')) {
    return null;
  }
  try {
    return new URL(cleaned, baseUrl).toString();
  } catch {
    return null;
  }
}

function flattenJson(value: any): any[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(flattenJson);
  if (typeof value === 'object') {
    return [
      value,
      ...flattenJson(value['@graph']),
      ...flattenJson(value.itemListElement),
    ];
  }
  return [];
}

function parseJsonLdJobs(html: string, source: CompanyCareerSource, atsType: AtsType) {
  const scripts = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  const jobs: RawScrapedJob[] = [];

  for (const script of scripts) {
    const body = script.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '').trim();
    try {
      const parsed = JSON.parse(decodeHtml(body));
      const nodes = flattenJson(parsed);
      for (const node of nodes) {
        const type = Array.isArray(node?.['@type']) ? node['@type'].join(' ') : node?.['@type'];
        if (!/jobposting/i.test(String(type || ''))) continue;
        const location = Array.isArray(node.jobLocation)
          ? node.jobLocation.map((item: any) => item?.address?.addressLocality || item?.address?.addressRegion || item?.address?.addressCountry).filter(Boolean).join(', ')
          : node.jobLocation?.address?.addressLocality || node.jobLocation?.address?.addressRegion || node.jobLocation?.address?.addressCountry;
        const url = decodeCareerHref(String(node.url || node.sameAs || source.careersUrl), source.careersUrl);
        if (!url) continue;
        jobs.push({
          portal: 'company_ats',
          title: stripHtml(String(node.title || node.name || '')),
          company: stripHtml(String(node.hiringOrganization?.name || source.company)),
          location: stripHtml(String(location || source.cityHints[0] || 'India')),
          url,
          applyUrl: url,
          employmentType: Array.isArray(node.employmentType) ? node.employmentType.join(', ') : node.employmentType || 'company_careers_page',
          postedDateText: node.datePosted,
          snippet: stripHtml(String(node.description || '')).slice(0, 360) || undefined,
          rawPayload: { extraction: 'direct_html_jsonld', company: source.company, atsType },
        });
      }
    } catch {
      // Invalid JSON-LD should not block other extraction paths.
    }
  }

  return jobs;
}

function titleFromHref(href: string) {
  try {
    const url = new URL(href);
    const candidate = url.pathname
      .split('/')
      .filter(Boolean)
      .pop()
      ?.replace(/\.[a-z0-9]+$/i, '')
      .replace(/[-_+]+/g, ' ')
      .replace(/\b\d{4,}\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!candidate) return '';
    return candidate.replace(/\b\w/g, (char) => char.toUpperCase());
  } catch {
    return '';
  }
}

function extractJobsFromCareerHtml(
  html: string,
  source: CompanyCareerSource,
  query: JobQuery,
  atsType: AtsType,
  maxPerCompany: number,
) {
  const roleTerms = roleTermsForQuery(query);
  const hrefSignals = atsHrefIncludes(source).map((signal) => signal.toLowerCase());
  const jobs: RawScrapedJob[] = parseJsonLdJobs(html, source, atsType)
    .filter((job) => isPlausibleCareerTitle(job, query))
    .slice(0, maxPerCompany);
  const seen = new Set<string>();
  jobs.forEach((job) => seen.add(job.url));
  const anchors = html.match(/<a\b[\s\S]*?<\/a>/gi) || [];

  for (const anchor of anchors) {
    if (jobs.length >= maxPerCompany) break;
    const hrefMatch = anchor.match(/\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i);
    const href = hrefMatch ? decodeCareerHref(hrefMatch[1] || hrefMatch[2] || hrefMatch[3] || '', source.careersUrl) : null;
    if (!href || seen.has(href)) continue;

    const text = stripHtml(anchor);
    const nearby = stripHtml(anchor.slice(0, 800));
    const haystack = `${text} ${href} ${nearby}`.toLowerCase();
    const hasCareerHref = hrefSignals.some((signal) => haystack.includes(signal));
    const hasRoleSignal = roleTerms.some((term) => haystack.includes(term));
    const looksLikeJobLink = /job|role|position|opening|career|requisition|apply|posting|vacanc/i.test(haystack);
    const sameDomain = (() => {
      try {
        return new URL(href).hostname.replace(/^www\./, '') === new URL(source.careersUrl).hostname.replace(/^www\./, '');
      } catch {
        return false;
      }
    })();
    if (!hasRoleSignal && !looksLikeJobLink) continue;
    if (!hasCareerHref && !(sameDomain && looksLikeJobLink)) continue;

    const title = text.length > 4 && text.length < 120 ? text : titleFromHref(href);
    if (!title) continue;

    const job: RawScrapedJob = {
      portal: 'company_ats',
      title,
      company: source.company,
      location: source.cityHints[0] || 'India',
      url: href,
      applyUrl: href,
      employmentType: `Official Career Page - ${source.company}`,
      snippet: nearby || undefined,
      rawPayload: { extraction: 'direct_html_fallback', company: source.company, atsType },
    };

    if (isPlausibleCareerTitle(job, query)) {
      seen.add(href);
      jobs.push(job);
    }
  }

  return jobs;
}

async function fetchCareerHtmlFallback(source: CompanyCareerSource, query: JobQuery, atsType: AtsType, maxPerCompany: number) {
  const response = await fetchWithRetries(source, source.careersUrl, {}, {
    retries: retryWeightForSource(source),
    timeoutMs: retryWeightForSource(source) > 0 ? 12000 : 8000,
  });
  const html = await response.text();
  if (/captcha|access denied|verify you are human|enable javascript|temporarily unavailable/i.test(stripHtml(html))) {
    throw new Error('access_gate: career page blocked direct HTML fetch');
  }
  return extractJobsFromCareerHtml(html, source, query, atsType, maxPerCompany);
}

async function fetchStructuredAtsJobs(source: CompanyCareerSource, query: JobQuery): Promise<RawScrapedJob[]> {
  const atsType = effectiveAtsType(source);

  if (atsType === 'greenhouse') {
    const slug = atsSlug(source, 'greenhouse.io');
    if (!slug) return [];
    const response = await fetchWithRetries(
      source,
      `https://boards.greenhouse.io/embed/job_board?for=${encodeURIComponent(slug)}`,
      {},
      { timeoutMs: 18000 },
    );
    const html = await response.text();
    const openings = html.match(/<div[^>]*class="[^"]*opening[^"]*"[\s\S]*?<\/div>/gi) || [];
    return openings.flatMap((opening) => {
      const anchor = opening.match(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
      if (!anchor) return [];
      const location = opening.match(/class="[^"]*location[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/i);
      const href = anchor[1].startsWith('http') ? anchor[1] : `https://boards.greenhouse.io${anchor[1]}`;
      const job: RawScrapedJob = {
        portal: 'company_ats',
        title: stripHtml(anchor[2]),
        company: source.company,
        location: location ? stripHtml(location[1]) : source.cityHints[0] || 'India',
        url: href,
        applyUrl: href,
        employmentType: 'company_careers_page',
        rawPayload: { extraction: 'greenhouse_embed', company: source.company, atsType },
      };
      return isPlausibleCareerTitle(job, query) ? [job] : [];
    });
  }

  if (atsType === 'lever') {
    const slug = atsSlug(source, 'lever.co');
    if (!slug) return [];
    const response = await fetchWithRetries(
      source,
      `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}`,
      {},
      { timeoutMs: 18000 },
    );
    const data = await response.json().catch(() => []);
    if (!Array.isArray(data)) return [];
    return data.flatMap((posting: any) => {
      const href = posting.hostedUrl || posting.applyUrl || `${source.careersUrl}/${posting.id || ''}`;
      const job: RawScrapedJob = {
        portal: 'company_ats',
        title: stripHtml(posting.text || posting.title || ''),
        company: source.company,
        location: posting.categories?.location || source.cityHints[0] || 'India',
        url: href,
        applyUrl: href,
        employmentType: 'company_careers_page',
        rawPayload: { extraction: 'lever_api', company: source.company, atsType },
      };
      return isPlausibleCareerTitle(job, query) ? [job] : [];
    });
  }

  if (atsType === 'ashby') {
    const slug = atsSlug(source, 'ashbyhq.com');
    if (!slug) return [];
    const response = await fetchWithRetries(
      source,
      'https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiBoardWithTeams',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          operationName: 'ApiBoardWithTeams',
          variables: { organizationHostedJobsPageName: slug },
          query: `query ApiBoardWithTeams($organizationHostedJobsPageName: String!) {
          jobBoard: jobBoardWithTeams(organizationHostedJobsPageName: $organizationHostedJobsPageName) {
            jobPostings { id title locationName employmentType secondaryLocations { locationName } }
          }
        }`,
        }),
      },
      { timeoutMs: 22000 },
    );
    const json = await response.json().catch(() => null);
    const postings = json?.data?.jobBoard?.jobPostings;
    if (!Array.isArray(postings)) return [];
    return postings.flatMap((posting: any) => {
      const locations = [
        posting.locationName,
        ...(posting.secondaryLocations || []).map((item: any) => item.locationName),
      ].filter(Boolean).join(', ');
      const href = `https://jobs.ashbyhq.com/${slug}/${posting.id}`;
      const job: RawScrapedJob = {
        portal: 'company_ats',
        title: stripHtml(posting.title || ''),
        company: source.company,
        location: locations || source.cityHints[0] || 'India',
        url: href,
        applyUrl: href,
        employmentType: posting.employmentType || 'company_careers_page',
        rawPayload: { extraction: 'ashby_graphql', company: source.company, atsType },
      };
      return isPlausibleCareerTitle(job, query) ? [job] : [];
    });
  }

  const publicExtractor = ADDITIONAL_ATS_EXTRACTORS[atsType];
  if (publicExtractor) {
    return (await publicExtractor.extract(source, query)).filter((job) => isPlausibleCareerTitle(job, query));
  }

  return [];
}

type CompanyAtsStats = {
  attempted: number;
  reached: number;
  structuredReached: number;
  browserReached: number;
  htmlFallbackReached: number;
  failed: number;
  blocked: number;
  timedOut: number;
};

function statsSummary(stats: CompanyAtsStats) {
  return `attempted ${stats.attempted} company career sites; reached ${stats.reached}; structured ATS APIs ${stats.structuredReached}; browser pages ${stats.browserReached}; HTML fallbacks ${stats.htmlFallbackReached}; failed ${stats.failed}; blocked ${stats.blocked}; timed out ${stats.timedOut}`;
}

export class CompanyAtsAdapter extends BasePortalAdapter {
  identifier = 'company_ats';
  displayName = 'ATS-backed company career pages';

  private async prepareCareerPage(page: any, source: CompanyCareerSource, attempt = 0) {
    const profile = careerProfileFor(source, attempt);
    await Promise.allSettled([
      page.setViewportSize(profile.viewport),
      page.setExtraHTTPHeaders({
        'accept-language': profile.acceptLanguage,
        'cache-control': 'no-cache',
        'pragma': 'no-cache',
        'user-agent': profile.userAgent,
      }),
    ]);
  }

  private async navigateCareerPage(page: any, source: CompanyCareerSource) {
    const attempts = 1 + retryWeightForSource(source);
    let lastGate: string | null = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      await this.prepareCareerPage(page, source, attempt);
      const timeoutMs = 9000 + attempt * 4000;
      const ok = await this.safeNavigate(page, source.careersUrl, timeoutMs);
      if (!ok) {
        await sleep(800 + attempt * 500);
        continue;
      }
      const gate = await this.detectAccessGate(page);
      if (!gate) return { ok: true as const, gate: null };
      lastGate = gate;
      if (!/timeout|network/i.test(gate)) break;
      await sleep(900 + attempt * 500);
    }

    return { ok: false as const, gate: lastGate };
  }

  async healthCheck(context: BrowserContext): Promise<boolean> {
    const page = await context.newPage();
    try {
      const isUp = await this.safeNavigate(page, 'https://www.amazon.jobs/en/search?loc_query=India', 20000);
      const gate = isUp ? await this.detectAccessGate(page) : null;
      return isUp && !gate;
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  async scrape(context: BrowserContext, query: JobQuery, onProgress?: (msg: string) => void): Promise<PortalScanResult> {
    const jobs: RawScrapedJob[] = [];
    const seenUrls = new Set<string>();
    const failures: string[] = [];
    const stats: CompanyAtsStats = {
      attempted: 0,
      reached: 0,
      structuredReached: 0,
      browserReached: 0,
      htmlFallbackReached: 0,
      failed: 0,
      blocked: 0,
      timedOut: 0,
    };
    const roleFamilies = inferRoleFamilies([
      ...query.titleVariants,
      ...(query.keywords || []),
    ]);
    const sources = companySourcesForRoleFamilies(roleFamilies, companyLimit(), {
      targetCompanies: query.targetCompanies,
      locations: query.locations,
      companyTypes: query.companyTypes,
    });

    try {
      for (const source of sources) {
        stats.attempted += 1;
        onProgress?.(`Checking company careers: ${source.company} (${stats.attempted}/${sources.length})`);
        let page: any = null;
        let sourceReached = false;
        let sourceJobCount = 0;
        const maxPerCompany = jobsPerCompanyCap();
        const addSourceJobs = (candidates: RawScrapedJob[], atsType: AtsType) => {
          for (const candidate of candidates) {
            if (sourceJobCount >= maxPerCompany || jobs.length >= jobCap()) break;
            const normalizedUrl = candidate.url.trim().toLowerCase();
            if (!normalizedUrl || seenUrls.has(normalizedUrl)) continue;
            seenUrls.add(normalizedUrl);
            jobs.push(attachCompanyCareerProof(candidate, source, atsType));
            sourceJobCount += 1;
          }
        };

        try {
          await waitForCompanyCareerDomainSlot(source.careersUrl);
          const atsType = effectiveAtsType(source);
          let structured: RawScrapedJob[] = [];
          try {
            structured = await fetchStructuredAtsJobs(source, query);
            if (structured.length) {
              sourceReached = true;
              stats.structuredReached += 1;
              addSourceJobs(structured, atsType);
            }
          } catch (structuredError) {
            failures.push(`${source.company}: ${atsType} endpoint failed; falling back to public page (${sourceErrorMessage(structuredError)})`);
          }

          if (sourceJobCount < maxPerCompany && jobs.length < jobCap()) {
            try {
              const htmlJobs = await fetchCareerHtmlFallback(source, query, atsType, maxPerCompany - sourceJobCount);
              sourceReached = true;
              stats.htmlFallbackReached += 1;
              addSourceJobs(htmlJobs, atsType);
              if (htmlJobs.length === 0) {
                failures.push(`${source.company}: career page reached but no matching job links found`);
              }
            } catch (htmlError) {
              const message = sourceErrorMessage(htmlError);
              if (/timeout|aborted/i.test(message)) stats.timedOut += 1;
              if (/access_gate|captcha|403|blocked|denied/i.test(message)) stats.blocked += 1;
              failures.push(`${source.company}: HTML fallback failed (${message})`);
            }
          }

          const shouldTryBrowserFallback = sourceJobCount === 0 && jobs.length < jobCap() && retryWeightForSource(source) > 0;

          if (shouldTryBrowserFallback) {
            page = await context.newPage();
            const nav = await this.navigateCareerPage(page, source);
            if (nav.ok) {
              sourceReached = true;
              stats.browserReached += 1;
              const extracted = await this.extractJobLinksFromPage(page, query, {
                hrefIncludes: [
                  ...atsHrefIncludes(source),
                  'jobsearch',
                  'search-results',
                  'search?',
                  'opening',
                  'reqid',
                  'jobid',
                ],
                max: maxPerCompany,
                defaultCompany: source.company,
                defaultLocation: source.cityHints[0] || 'India',
              });

              addSourceJobs(
                extracted
                  .filter((item) => isPlausibleCareerTitle(item, query))
                  .map((job) => ({
                    ...job,
                    portal: this.identifier,
                    company: source.company,
                    employmentType: `Official Career Page - ${source.company}`,
                  })),
                atsType,
              );
            } else if (nav.gate) {
              stats.blocked += 1;
              failures.push(`${source.company}: ${nav.gate}`);
            } else {
              stats.timedOut += 1;
              failures.push(`${source.company}: navigation timed out`);
            }
          }

          if (sourceReached) stats.reached += 1;
          else stats.failed += 1;

          if (jobs.length >= jobCap()) break;
        } catch (sourceError) {
          const message = sourceErrorMessage(sourceError);
          if (/timeout|aborted/i.test(message)) stats.timedOut += 1;
          if (/captcha|403|blocked|denied|access_gate/i.test(message)) stats.blocked += 1;
          stats.failed += 1;
          failures.push(`${source.company}: ${message}`);
        } finally {
          if (page) {
            await page.close().catch(() => undefined);
          }
        }
      }

      if (jobs.length === 0) {
        throw new Error(
          failures.length
            ? `empty_results: company careers returned no matching job links (${statsSummary(stats)}); ${failures.slice(0, 6).join('; ')}`
            : `empty_results: company careers returned no matching job links (${statsSummary(stats)})`,
        );
      }

      return this.formatResult(
        jobs.slice(0, jobCap()),
        failures.length ? `partial_source_failures: ${statsSummary(stats)}; ${failures.slice(0, 10).join('; ')}` : undefined,
        failures.length ? 'partial_source_failures' : undefined,
      );
    } catch (error) {
      return this.formatFailureResult(jobs, error);
    }
  }
}
