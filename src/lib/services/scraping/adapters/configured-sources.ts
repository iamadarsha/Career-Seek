import { BrowserContext } from 'playwright';
import { JobQuery, PortalScanResult, RawScrapedJob } from '../types';
import { BasePortalAdapter } from './base';

type SearchUrlBuilder = (query: JobQuery) => string[];

interface ConfiguredSource {
  identifier: string;
  displayName: string;
  homeUrl: string;
  hrefIncludes: string[];
  searchUrls: SearchUrlBuilder;
  maxJobs?: number;
  maxTitleVariants?: number;
  maxLocations?: number;
  defaultCompany?: string;
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function firstTitle(query: JobQuery) {
  return query.titleVariants[0] || 'product manager';
}

function firstLocation(query: JobQuery) {
  const location = query.locations?.[0] || 'India';
  return /anywhere|remote/i.test(location) ? 'India' : location;
}

function uniqueVariants(query: JobQuery, limit = 3) {
  const seen = new Set<string>();
  const variants: string[] = [];
  for (const value of query.titleVariants || []) {
    const cleaned = String(value || '').replace(/\s+/g, ' ').trim();
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key)) continue;
    seen.add(key);
    variants.push(cleaned);
    if (variants.length >= limit) break;
  }
  return variants.length ? variants : ['Product Manager'];
}

function uniqueLocations(query: JobQuery, limit = 2) {
  const seen = new Set<string>();
  const locations: string[] = [];
  const raw = query.locations?.length ? query.locations : ['India'];
  for (const value of raw) {
    const cleaned = String(value || '').replace(/\s+/g, ' ').trim();
    if (!cleaned) continue;
    const normalized = /remote|anywhere/i.test(cleaned) ? 'India' : cleaned;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    locations.push(normalized);
    if (locations.length >= limit) break;
  }
  if (!locations.some((location) => location.toLowerCase() === 'india')) {
    locations.push('India');
  }
  return locations.slice(0, limit);
}

function isLikelyConfiguredJob(source: ConfiguredSource, job: RawScrapedJob) {
  const title = String(job.title || '').replace(/\s+/g, ' ').trim();
  const url = String(job.url || '').trim();
  if (!title || !url) return false;

  const lowerTitle = title.toLowerCase();
  const lowerUrl = url.toLowerCase();
  const path = (() => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch {
      return lowerUrl;
    }
  })();

  if (/ref=(?:topnavigation|nav)\b|[?&](?:keyword|location|query)=|\/job-search\/|\/search\/|\/jobs-in-|\/myshine\/|\/latestjob\/|\/freejobalert/i.test(lowerUrl)) {
    return false;
  }
  if (/^(?:jobs?|careers?|search results?|view all|all jobs|it & systems|software development|data engineering|data analytics|genai)$/i.test(title)) {
    return false;
  }
  if (/\bjobs?\b$/i.test(title) && !/\b(manager|engineer|developer|designer|analyst|consultant|specialist|architect|scientist|researcher|officer|associate|executive)\b/i.test(lowerTitle)) {
    return false;
  }
  if (source.identifier === 'cutshort' && !/\/job\//.test(path)) return false;
  if ((source.identifier === 'hirist' || source.identifier === 'iimjobs') && !/\/j\//.test(path)) return false;
  if (source.identifier === 'shine' && !/\/jobs\//.test(path)) return false;
  if (source.identifier === 'timesjobs' && !/\/job-detail\//.test(path)) return false;
  if (source.identifier === 'apna' && !/\/job\//.test(path)) return false;
  if (source.identifier === 'workindia' && !/\/job\//.test(path)) return false;
  if (/\/(?:c|k)\//.test(path)) return false;
  if (/\/jobs\/[^/?#]+-jobs(?:-in-[^/?#]+)?\/?$/.test(path)) return false;

  return true;
}

function encodedTitle(query: JobQuery) {
  return encodeURIComponent(firstTitle(query));
}

function encodedLocation(query: JobQuery) {
  return encodeURIComponent(firstLocation(query));
}

export const CONFIGURED_INDIA_SOURCES: ConfiguredSource[] = [
  {
    identifier: 'shine',
    displayName: 'Shine',
    homeUrl: 'https://www.shine.com',
    hrefIncludes: ['/jobs/'],
    searchUrls: (query) => [
      `https://www.shine.com/job-search/${slug(firstTitle(query))}-jobs-in-${slug(firstLocation(query)) || 'india'}`,
      `https://www.shine.com/job-search/${encodedTitle(query)}-jobs`,
    ],
    maxJobs: 18,
    maxTitleVariants: 3,
    maxLocations: 2,
  },
  {
    identifier: 'timesjobs',
    displayName: 'TimesJobs',
    homeUrl: 'https://www.timesjobs.com',
    hrefIncludes: ['/candidate/job-detail/', '/job-detail/', 'timesjobs.com/job-detail'],
    searchUrls: (query) => [
      `https://www.timesjobs.com/candidate/job-search.html?searchType=Home_Search&from=submit&txtKeywords=${encodedTitle(query)}&txtLocation=${encodedLocation(query)}`,
    ],
    maxJobs: 18,
    maxTitleVariants: 2,
    maxLocations: 2,
  },
  {
    identifier: 'glassdoor',
    displayName: 'Glassdoor',
    homeUrl: 'https://www.glassdoor.co.in',
    hrefIncludes: ['/job-listing/'],
    searchUrls: (query) => [
      `https://www.glassdoor.co.in/Job/india-${slug(firstTitle(query))}-jobs-SRCH_IL.0,5_IN115.htm`,
    ],
    maxJobs: 12,
    maxTitleVariants: 2,
    maxLocations: 2,
  },
  {
    identifier: 'placementindia',
    displayName: 'PlacementIndia',
    homeUrl: 'https://www.placementindia.com',
    hrefIncludes: ['/job-detail/'],
    searchUrls: (query) => [
      `https://www.placementindia.com/job-search/${slug(firstTitle(query))}-jobs-in-${slug(firstLocation(query)) || 'india'}.htm`,
      `https://www.placementindia.com/job-search/${slug(firstTitle(query))}-jobs.htm`,
    ],
    maxJobs: 18,
    maxTitleVariants: 2,
    maxLocations: 2,
  },
  {
    identifier: 'cutshort',
    displayName: 'Cutshort',
    homeUrl: 'https://cutshort.io',
    hrefIncludes: ['/job/'],
    searchUrls: (query) => [
      `https://cutshort.io/jobs/${slug(firstTitle(query))}-jobs`,
      `https://cutshort.io/jobs/${slug(firstTitle(query))}-jobs-in-${slug(firstLocation(query)) || 'india'}`,
    ],
    maxJobs: 18,
    maxTitleVariants: 3,
    maxLocations: 2,
  },
  {
    identifier: 'hirist',
    displayName: 'Hirist',
    homeUrl: 'https://www.hirist.tech',
    hrefIncludes: ['/j/'],
    searchUrls: (query) => [
      `https://www.hirist.tech/search/${slug(firstTitle(query))}?loc=${encodedLocation(query)}`,
      `https://www.hirist.tech/jobs/${slug(firstTitle(query))}`,
    ],
    maxJobs: 18,
    maxTitleVariants: 3,
    maxLocations: 2,
  },
  {
    identifier: 'iimjobs',
    displayName: 'iimjobs',
    homeUrl: 'https://www.iimjobs.com',
    hrefIncludes: ['/j/'],
    searchUrls: (query) => [
      `https://www.iimjobs.com/search/${encodedTitle(query)}-0-0-0-1.html`,
      `https://www.iimjobs.com/search/${encodedTitle(query)}.html`,
    ],
    maxJobs: 18,
    maxTitleVariants: 3,
    maxLocations: 2,
  },
  {
    identifier: 'hirect',
    displayName: 'Hirect',
    homeUrl: 'https://www.hirect.in',
    hrefIncludes: ['/job/'],
    searchUrls: (query) => [
      `https://www.hirect.in/jobs/${slug(firstTitle(query))}-jobs-in-${slug(firstLocation(query)) || 'india'}`,
      `https://www.hirect.in/search?keyword=${encodedTitle(query)}&location=${encodedLocation(query)}`,
    ],
    maxJobs: 15,
    maxTitleVariants: 2,
    maxLocations: 2,
  },
  {
    identifier: 'internshala',
    displayName: 'Internshala',
    homeUrl: 'https://internshala.com',
    hrefIncludes: ['/job/detail/', '/jobs/', '/internship/detail/'],
    searchUrls: (query) => [
      `https://internshala.com/jobs/${slug(firstTitle(query))}-jobs/`,
      `https://internshala.com/internships/${slug(firstTitle(query))}-internship/`,
    ],
    maxJobs: 15,
  },
  {
    identifier: 'freshersworld',
    displayName: 'Freshersworld',
    homeUrl: 'https://www.freshersworld.com',
    hrefIncludes: ['/jobs/', '/job/', 'freshersworld.com/jobs'],
    searchUrls: (query) => [
      `https://www.freshersworld.com/jobs/jobsearch/${slug(firstTitle(query))}-jobs`,
    ],
    maxJobs: 15,
  },
  {
    identifier: 'apna',
    displayName: 'Apna',
    homeUrl: 'https://apna.co',
    hrefIncludes: ['/job/'],
    searchUrls: (query) => [
      `https://apna.co/jobs/${slug(firstTitle(query))}-jobs-in-${slug(firstLocation(query)) || 'india'}`,
      `https://apna.co/jobs?keyword=${encodedTitle(query)}&location=${encodedLocation(query)}`,
    ],
    maxJobs: 15,
    maxTitleVariants: 2,
    maxLocations: 2,
  },
  {
    identifier: 'workindia',
    displayName: 'WorkIndia',
    homeUrl: 'https://www.workindia.in',
    hrefIncludes: ['/job/'],
    searchUrls: (query) => [
      `https://www.workindia.in/${slug(firstTitle(query))}-jobs/`,
      `https://www.workindia.in/jobs-in-${slug(firstLocation(query)) || 'india'}/?q=${encodedTitle(query)}`,
    ],
    maxJobs: 15,
    maxTitleVariants: 2,
    maxLocations: 2,
  },
  {
    identifier: 'government',
    displayName: 'Government and public recruitment',
    homeUrl: 'https://www.sarkariresult.com',
    hrefIncludes: ['sarkariresult.com', 'freejobalert.com', '.gov.in', 'recruitment'],
    searchUrls: (query) => [
      `https://www.google.com/search?q=${encodedTitle(query)}%20site%3Agov.in%20recruitment%20India`,
      'https://www.sarkariresult.com/latestjob/',
      'https://www.freejobalert.com/',
    ],
    maxJobs: 12,
    defaultCompany: 'Government recruitment',
  },
];

export class ConfiguredSourceAdapter extends BasePortalAdapter {
  readonly identifier: string;
  readonly displayName: string;

  constructor(private readonly config: ConfiguredSource) {
    super();
    this.identifier = config.identifier;
    this.displayName = config.displayName;
  }

  async healthCheck(context: BrowserContext): Promise<boolean> {
    const page = await context.newPage();
    try {
      return await this.safeNavigate(page, this.config.homeUrl, 15000);
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  async scrape(context: BrowserContext, query: JobQuery, onProgress?: (msg: string) => void): Promise<PortalScanResult> {
    const page = await context.newPage();
    const jobs: RawScrapedJob[] = [];
    const seen = new Set<string>();

    try {
      for (const title of uniqueVariants(query, this.config.maxTitleVariants || 2)) {
        if (jobs.length >= (this.config.maxJobs || 12)) break;
        for (const location of uniqueLocations(query, this.config.maxLocations || 2)) {
          if (jobs.length >= (this.config.maxJobs || 12)) break;
          const variantQuery: JobQuery = {
            ...query,
            titleVariants: [title],
            locations: [location],
          };
          for (const url of this.config.searchUrls(variantQuery).slice(0, 3)) {
            onProgress?.(`Opening ${this.displayName} search for ${title} in ${location}`);
            const ok = await this.safeNavigate(page, url, 26000);
            if (!ok) continue;

            const gate = await this.detectAccessGate(page);
            if (gate) {
              throw new Error(`${gate}: ${this.displayName} did not allow this public search`);
            }

            const extracted = await this.extractJobLinksFromPage(page, variantQuery, {
              hrefIncludes: this.config.hrefIncludes,
              max: (this.config.maxJobs || 12) - jobs.length,
              defaultCompany: this.config.defaultCompany,
              defaultLocation: location,
            });

            for (const job of extracted) {
              const candidate: RawScrapedJob = {
                ...job,
                portal: this.identifier,
                rawPayload: {
                  ...(job.rawPayload || {}),
                  configuredSource: this.identifier,
                  searchedUrl: url,
                },
              };
              const dedupeKey = `${String(candidate.url || '').toLowerCase()}::${String(candidate.title || '').toLowerCase()}`;
              if (!candidate.title || !candidate.url || seen.has(dedupeKey) || !isLikelyConfiguredJob(this.config, candidate)) continue;
              seen.add(dedupeKey);
              jobs.push(candidate);
            }

            if (jobs.length >= (this.config.maxJobs || 12)) break;
          }
        }
      }

      if (jobs.length === 0) {
        throw new Error(`empty_results: ${this.displayName} returned no matching public job links`);
      }

      return this.formatResult(jobs.slice(0, this.config.maxJobs || 12));
    } catch (error) {
      return this.formatFailureResult(jobs, error, page);
    } finally {
      await page.close().catch(() => undefined);
    }
  }
}
