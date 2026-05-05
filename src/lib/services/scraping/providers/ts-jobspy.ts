import type { ScrapeInput, ScrapeProvider, PortalType } from '../scraper-manager';
import type { PortalScanResult, RawScrapedJob } from '../types';

function searchTerm(input: ScrapeInput) {
  return [
    input.query.titleVariants?.[0],
    ...(input.query.keywords || []).slice(0, 4),
  ].filter(Boolean).join(' ').trim() || 'product manager';
}

function locationText(location: unknown) {
  if (!location) return undefined;
  if (typeof location === 'string') return location;
  const value = location as Record<string, unknown>;
  return [value.city, value.state, value.country].filter(Boolean).join(', ') || undefined;
}

function salaryText(job: any) {
  const compensation = job.compensation || {};
  const min = compensation.minAmount ?? job.minAmount;
  const max = compensation.maxAmount ?? job.maxAmount;
  const currency = compensation.currency ?? job.currency;
  if (!min && !max) return undefined;
  return `${currency || ''} ${min || ''}${max ? `-${max}` : ''}`.trim();
}

function mapJob(portal: string, job: any): RawScrapedJob {
  return {
    portal,
    externalId: job.id || job.jobId || job.job_url || job.jobUrl,
    title: String(job.title || 'Untitled role'),
    company: String(job.companyName || job.company || 'Company not listed'),
    location: locationText(job.location),
    isRemote: Boolean(job.isRemote),
    salaryText: salaryText(job),
    url: String(job.jobUrl || job.job_url || job.url || job.jobUrlDirect || ''),
    applyUrl: job.jobUrlDirect || job.applyUrl || undefined,
    postedDateText: job.datePosted ? String(job.datePosted) : undefined,
    snippet: String(job.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1_500),
    employmentType: Array.isArray(job.jobType) ? job.jobType.join(', ') : job.jobType,
    rawPayload: { provider: 'ts-jobspy', job },
  };
}

export class TsJobSpyProvider implements ScrapeProvider {
  readonly id = 'ts-jobspy';
  readonly label = 'ts-jobspy upstream library';

  supports(portal: PortalType): boolean {
    return portal === 'linkedin' || portal === 'indeed';
  }

  async isAvailable(): Promise<boolean> {
    try {
      const mod = await import('ts-jobspy');
      return typeof mod.scrapeJobs === 'function';
    } catch {
      return false;
    }
  }

  async scrape(input: ScrapeInput): Promise<PortalScanResult> {
    const { scrapeJobs } = await import('ts-jobspy');
    const jobs = await scrapeJobs({
      siteName: input.portal as 'linkedin' | 'indeed',
      searchTerm: searchTerm(input),
      location: input.query.locations?.[0] || 'India',
      resultsWanted: 25,
      countryIndeed: 'india',
      isRemote: input.query.isRemote,
      descriptionFormat: 'markdown',
      linkedinFetchDescription: input.portal === 'linkedin',
      hoursOld: 24 * 14,
    });
    const mapped = jobs.map((job: any) => mapJob(input.portal, job)).filter((job: RawScrapedJob) => Boolean(job.url));
    return {
      portal: input.portal,
      status: mapped.length ? 'success' : 'failed',
      jobs: mapped,
      error: mapped.length ? undefined : 'empty_results: ts-jobspy returned no usable jobs.',
      failureCode: mapped.length ? undefined : 'empty_results',
    };
  }
}
