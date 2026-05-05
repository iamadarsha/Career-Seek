import { type AtsType, type CompanyCareerSource } from '../company-careers-map';
import { type JobQuery, type RawScrapedJob } from '../types';

export interface StructuredAtsExtractor {
  readonly atsType: AtsType;
  extract(source: CompanyCareerSource, query: JobQuery): Promise<RawScrapedJob[]>;
}

type CandidateJob = Partial<RawScrapedJob> & {
  title: string;
  url: string;
};

const PUBLIC_FETCH_TIMEOUT_MS = 15000;

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripHtml(value: string) {
  return decodeHtml(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function absolutize(href: string, baseUrl: string) {
  try {
    return new URL(decodeHtml(href), baseUrl).toString();
  } catch {
    return href;
  }
}

async function fetchPublicText(url: string, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PUBLIC_FETCH_TIMEOUT_MS);
  const extraHeaders =
    init?.headers && !Array.isArray(init.headers) && !(init.headers instanceof Headers)
      ? init.headers as Record<string, string>
      : {};
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
        'user-agent': 'Mozilla/5.0 CareerSeek/1.0 public-career-page-parser',
        ...extraHeaders,
      },
    });
    if (!response.ok) return null;
    return response.text();
  } finally {
    clearTimeout(timeout);
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

function parseJsonLd(html: string, source: CompanyCareerSource, extraction: string): CandidateJob[] {
  const scripts = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  const jobs: CandidateJob[] = [];

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
        const url = absolutize(String(node.url || node.sameAs || source.careersUrl), source.careersUrl);
        jobs.push({
          title: stripHtml(String(node.title || node.name || '')),
          company: stripHtml(String(node.hiringOrganization?.name || source.company)),
          location: stripHtml(String(location || source.cityHints[0] || 'India')),
          url,
          applyUrl: url,
          employmentType: Array.isArray(node.employmentType) ? node.employmentType.join(', ') : node.employmentType || 'company_careers_page',
          postedDateText: node.datePosted,
          snippet: stripHtml(String(node.description || '')).slice(0, 400),
          rawPayload: { extraction, atsType: source.atsType, company: source.company, jsonLd: true },
        });
      }
    } catch {
      // Keep public page extraction best-effort. Invalid JSON-LD should not fail the scan.
    }
  }

  return jobs.filter((job) => job.title && job.url);
}

function extractTitleNearAnchor(anchorHtml: string) {
  const aria = anchorHtml.match(/aria-label=["']([^"']+)["']/i)?.[1];
  const title = anchorHtml.match(/title=["']([^"']+)["']/i)?.[1];
  const text = anchorHtml.match(/>([\s\S]*?)<\/a>/i)?.[1];
  return stripHtml(aria || title || text || '');
}

function anchorJobsFromHtml(
  html: string,
  source: CompanyCareerSource,
  extraction: string,
  hrefPattern: RegExp,
) {
  const anchors = html.match(/<a\b[^>]*href=["'][^"']+["'][\s\S]*?<\/a>/gi) || [];
  const jobs: CandidateJob[] = [];
  const seen = new Set<string>();

  for (const anchor of anchors) {
    const href = anchor.match(/\bhref=["']([^"']+)["']/i)?.[1];
    if (!href || !hrefPattern.test(href)) continue;
    const url = absolutize(href, source.careersUrl);
    if (seen.has(url)) continue;
    seen.add(url);
    const title = extractTitleNearAnchor(anchor);
    if (!title || title.length < 4) continue;

    jobs.push({
      title,
      company: source.company,
      location: source.cityHints[0] || 'India',
      url,
      applyUrl: url,
      employmentType: 'company_careers_page',
      rawPayload: { extraction, atsType: source.atsType, company: source.company, htmlAnchor: true },
    });
  }

  return jobs;
}

function roleTerms(query: JobQuery) {
  return [
    ...query.titleVariants,
    ...(query.keywords || []),
  ]
    .flatMap((value) => String(value).toLowerCase().split(/[^a-z0-9+.#]+/))
    .filter((term) => term.length > 2 && !['and', 'the', 'for', 'with', 'role', 'jobs'].includes(term));
}

function matchesQuery(job: CandidateJob, query: JobQuery) {
  const terms = roleTerms(query);
  if (terms.length === 0) return true;
  const haystack = `${job.title} ${job.snippet || ''} ${job.url}`.toLowerCase();
  return terms.some((term) => haystack.includes(term));
}

function normalizeJobs(
  jobs: CandidateJob[],
  source: CompanyCareerSource,
  query: JobQuery,
  extraction: string,
): RawScrapedJob[] {
  const seen = new Set<string>();
  return jobs
    .filter((job) => job.title && job.url)
    .filter((job) => !/^(search|reset|clear|careers|jobs|view all|learn more)$/i.test(job.title))
    .filter((job) => matchesQuery(job, query))
    .flatMap((job) => {
      const key = `${job.title.toLowerCase()}::${job.url}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{
        portal: 'company_ats',
        externalId: job.externalId,
        title: stripHtml(job.title),
        company: job.company || source.company,
        location: job.location || source.cityHints[0] || 'India',
        isRemote: job.isRemote,
        isHybrid: job.isHybrid,
        salaryText: job.salaryText,
        experienceText: job.experienceText,
        url: job.url,
        applyUrl: job.applyUrl || job.url,
        postedDateText: job.postedDateText,
        snippet: job.snippet,
        employmentType: job.employmentType || 'company_careers_page',
        rawPayload: {
          ...(job.rawPayload || {}),
          extraction,
          atsType: source.atsType,
          company: source.company,
          structuredStatus: 'public_page_or_endpoint_best_effort',
        },
      }];
    });
}

abstract class PublicPageAtsExtractor implements StructuredAtsExtractor {
  abstract readonly atsType: AtsType;
  protected abstract readonly extraction: string;
  protected abstract readonly hrefPattern: RegExp;

  async extract(source: CompanyCareerSource, query: JobQuery): Promise<RawScrapedJob[]> {
    const html = await fetchPublicText(source.careersUrl);
    if (!html) return [];
    const jobs = [
      ...parseJsonLd(html, source, this.extraction),
      ...anchorJobsFromHtml(html, source, this.extraction, this.hrefPattern),
    ];
    return normalizeJobs(jobs, source, query, this.extraction);
  }
}

export class WorkdayAtsExtractor extends PublicPageAtsExtractor {
  readonly atsType = 'workday' as const;
  protected readonly extraction = 'workday_public_page_fallback';
  protected readonly hrefPattern = /(?:workdayjobs|myworkdayjobs|\/job\/|\/jobs\/|jobposting|jobreq)/i;
}

export class RipplingAtsExtractor extends PublicPageAtsExtractor {
  readonly atsType = 'rippling' as const;
  protected readonly extraction = 'rippling_public_page_fallback';
  protected readonly hrefPattern = /(?:ats\.rippling\.com|\/careers\/open-roles|\/jobs\/|\/job\/)/i;
}

export class IcimsAtsExtractor extends PublicPageAtsExtractor {
  readonly atsType = 'icims' as const;
  protected readonly extraction = 'icims_public_page_fallback';
  protected readonly hrefPattern = /(?:icims\.com|icimscloud\.com|\/jobs\/\d+|\/careers\/)/i;
}

export class SuccessFactorsAtsExtractor extends PublicPageAtsExtractor {
  readonly atsType = 'successfactors' as const;
  protected readonly extraction = 'successfactors_public_page_fallback';
  protected readonly hrefPattern = /(?:successfactors|sapsf|sfcareer|jobreqcareer|\/job\/|\/jobs\/)/i;
}

export class BambooHrAtsExtractor extends PublicPageAtsExtractor {
  readonly atsType = 'bamboohr' as const;
  protected readonly extraction = 'bamboohr_public_page_fallback';
  protected readonly hrefPattern = /(?:bamboohr\.com\/careers|bamboohr\.com\/jobs|apply\.bamboohr\.com|\/careers\/|\/jobs\/)/i;

  async extract(source: CompanyCareerSource, query: JobQuery): Promise<RawScrapedJob[]> {
    const publicListJobs = await this.extractPublicListEndpoint(source, query);
    if (publicListJobs.length) return publicListJobs;
    return super.extract(source, query);
  }

  private async extractPublicListEndpoint(source: CompanyCareerSource, query: JobQuery) {
    let endpoint: string | null = null;
    try {
      const url = new URL(source.careersUrl);
      if (url.hostname.includes('bamboohr.com')) {
        endpoint = `${url.origin}/careers/list`;
      }
    } catch {
      endpoint = null;
    }
    if (!endpoint) return [];

    const body = await fetchPublicText(endpoint, { headers: { accept: 'application/json,text/html;q=0.9,*/*;q=0.8' } });
    if (!body) return [];

    try {
      const parsed = JSON.parse(body);
      const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.result) ? parsed.result : Array.isArray(parsed?.jobs) ? parsed.jobs : [];
      const jobs: CandidateJob[] = list.flatMap((item: any) => {
        const id = item.id || item.jobId || item.positionId;
        const title = String(item.title || item.jobTitle || item.postingTitle || '').trim();
        if (!id || !title) return [];
        const url = absolutize(`/careers/${id}`, source.careersUrl);
        return [{
          externalId: String(id),
          title,
          company: source.company,
          location: item.location || item.city || source.cityHints[0] || 'India',
          url,
          applyUrl: url,
          employmentType: item.employmentType || item.type || 'company_careers_page',
          rawPayload: { extraction: 'bamboohr_public_careers_list', atsType: this.atsType, company: source.company },
        }];
      });
      return normalizeJobs(jobs, source, query, 'bamboohr_public_careers_list');
    } catch {
      const jobs = [
        ...parseJsonLd(body, source, 'bamboohr_public_careers_list_html'),
        ...anchorJobsFromHtml(body, source, 'bamboohr_public_careers_list_html', this.hrefPattern),
      ];
      return normalizeJobs(jobs, source, query, 'bamboohr_public_careers_list_html');
    }
  }
}

export const ADDITIONAL_ATS_EXTRACTORS: Partial<Record<AtsType, StructuredAtsExtractor>> = {
  workday: new WorkdayAtsExtractor(),
  bamboohr: new BambooHrAtsExtractor(),
  rippling: new RipplingAtsExtractor(),
  icims: new IcimsAtsExtractor(),
  successfactors: new SuccessFactorsAtsExtractor(),
};
