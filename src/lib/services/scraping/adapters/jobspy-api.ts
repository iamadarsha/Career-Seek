/**
 * JobSpy API Adapter
 *
 * Uses the ts-jobspy npm package (scrapeJobs) for direct HTTP-based scraping
 * of LinkedIn and Indeed — no Playwright browser needed.
 * Falls back gracefully when the package returns no results or throws.
 *
 * Registered in orchestrator as portal identifier: 'jobspy_api'
 */

import { BrowserContext } from 'playwright';
import { BasePortalAdapter } from './base';
import { JobQuery, PortalScanResult, RawScrapedJob } from '../types';

function safeText(value: unknown): string {
  return String(value ?? '').trim();
}

function buildSalaryText(job: any): string {
  if (job.minAmount && job.maxAmount) {
    const min = Math.round(Number(job.minAmount)).toLocaleString();
    const max = Math.round(Number(job.maxAmount)).toLocaleString();
    const currency = job.currency || '';
    const interval = job.interval || 'yearly';
    return `${currency} ${min}–${max} ${interval}`.trim();
  }
  if (job.minAmount) {
    const min = Math.round(Number(job.minAmount)).toLocaleString();
    return `${job.currency || ''} ${min}+ ${job.interval || 'yearly'}`.trim();
  }
  return '';
}

function mapJobDataToRaw(jobData: any, site: string): RawScrapedJob | null {
  const title = safeText(jobData.title);
  const company = safeText(jobData.company);
  const url = safeText(jobData.jobUrl || jobData.jobUrlDirect);
  if (!title || !url) return null;

  let location = '';
  if (jobData.location) {
    const loc = jobData.location;
    location = typeof loc === 'string'
      ? loc
      : [loc.city, loc.state, loc.country].filter(Boolean).join(', ');
  }

  return {
    portal: 'jobspy_api',
    externalId: jobData.id ? `${site}-${jobData.id}` : undefined,
    title,
    company: company || 'Unknown',
    location,
    isRemote: Boolean(jobData.isRemote),
    salaryText: buildSalaryText(jobData),
    url,
    applyUrl: safeText(jobData.jobUrlDirect || jobData.jobUrl),
    postedDateText: jobData.datePosted ? String(jobData.datePosted).split('T')[0] : undefined,
    snippet: safeText(jobData.description).slice(0, 500),
    employmentType: safeText(jobData.jobType),
    rawPayload: { site, jobData },
    status: 'full',
  };
}

export class JobSpyApiAdapter extends BasePortalAdapter {
  identifier = 'jobspy_api';
  displayName = 'JobSpy API (LinkedIn + Indeed direct)';

  // ts-jobspy is pure HTTP — health check just tests internet connectivity
  async healthCheck(_context: BrowserContext): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const res = await fetch('https://www.linkedin.com/robots.txt', {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      clearTimeout(timeoutId);
      return res.status < 500;
    } catch {
      return false;
    }
  }

  async scrape(
    _context: BrowserContext,
    query: JobQuery,
    onProgress?: (msg: string) => void,
  ): Promise<PortalScanResult> {
    const jobs: RawScrapedJob[] = [];

    try {
      // Dynamic import so Next.js server components don't tree-shake it
      const { scrapeJobs } = await import('ts-jobspy');

      const searchTerm = query.titleVariants?.[0] || query.keywords?.join(' ') || 'software engineer';
      const location = query.locations?.[0] || 'India';
      const isIndian = /india|bangalore|bengaluru|mumbai|delhi|hyderabad|chennai|pune/i.test(location);

      onProgress?.(`[jobspy_api] Searching LinkedIn + Indeed for "${searchTerm}" in ${location}`);

      const results = await scrapeJobs({
        siteName: ['linkedin', 'indeed'],
        searchTerm,
        location,
        countryIndeed: isIndian ? 'india' : undefined,
        resultsWanted: 20,
        descriptionFormat: 'plain',
        linkedinFetchDescription: true,
        hoursOld: 72,  // last 3 days only
        verbose: 0,
      });

      onProgress?.(`[jobspy_api] Got ${results.length} raw results`);

      for (const jobData of results) {
        const mapped = mapJobDataToRaw(jobData, jobData.site || 'jobspy');
        if (mapped) jobs.push(mapped);
      }

      if (jobs.length === 0) {
        return this.formatFailureResult(jobs, new Error('empty_results: JobSpy returned no results for this query'), null as any);
      }

      return this.formatResult(jobs.slice(0, 25));
    } catch (error) {
      return this.formatFailureResult(jobs, error, null as any);
    }
  }
}
