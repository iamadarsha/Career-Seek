import { BrowserContext } from 'playwright';
import { JobQuery, PortalScanResult, RawScrapedJob } from '../types';
import { BasePortalAdapter } from './base';
import { sourceCapabilities } from '../source-universe';

const GOOGLE_JOBS_CAPABILITIES = sourceCapabilities('google_jobs');

function searchUrl(query: JobQuery) {
  const title = query.titleVariants[0] || 'product manager';
  const location = query.locations?.[0] && !/anywhere/i.test(query.locations[0]) ? query.locations[0] : 'India';
  const q = [
    title,
    'jobs',
    location,
    query.isRemote ? 'remote' : '',
    'India careers',
  ].filter(Boolean).join(' ');
  return `https://www.google.com/search?q=${encodeURIComponent(q)}&ibp=htl;jobs`;
}

export class GoogleJobsDiscoveryAdapter extends BasePortalAdapter {
  identifier = 'google_jobs';
  displayName = 'Google for Jobs discovery';

  async healthCheck(context: BrowserContext): Promise<boolean> {
    const page = await context.newPage();
    try {
      const isUp = await this.safeNavigate(page, 'https://www.google.com/search?q=jobs+India', 15000);
      const gate = isUp ? await this.detectAccessGate(page) : null;
      return isUp && !gate;
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  async scrape(context: BrowserContext, query: JobQuery, onProgress?: (msg: string) => void): Promise<PortalScanResult> {
    const page = await context.newPage();
    const jobs: RawScrapedJob[] = [];

    try {
      const url = searchUrl(query);
      onProgress?.('Opening Google for Jobs discovery');
      const ok = await this.safeNavigate(page, url, 30000);
      if (!ok) throw new Error('browser_error: Google search did not load');

      const gate = await this.detectAccessGate(page);
      if (gate) throw new Error(`${gate}: Google search gated this discovery request`);

      const extracted = await this.extractJobLinksFromPage(page, query, {
        hrefIncludes: [
          '/jobs/',
          '/job/',
          '/careers',
          '/career',
          'linkedin.com/jobs',
          'naukri.com',
          'foundit.in',
          'shine.com',
          'greenhouse.io',
          'lever.co',
          'ashbyhq.com',
          'workdayjobs.com',
        ],
        max: 18,
        defaultLocation: query.locations?.[0] || 'India',
      });

      for (const job of extracted) {
        jobs.push({
          ...job,
          portal: this.identifier,
          employmentType: 'google_jobs_discovery',
          rawPayload: {
            ...(job.rawPayload || {}),
            discoverySource: 'google_for_jobs',
            searchedUrl: url,
            sourceCapabilities: GOOGLE_JOBS_CAPABILITIES,
          },
        });
      }

      if (jobs.length === 0) {
        throw new Error('empty_results: Google for Jobs discovery returned no matching public job links');
      }

      return this.formatResult(jobs);
    } catch (error) {
      return this.formatFailureResult(jobs, error, page);
    } finally {
      await page.close().catch(() => undefined);
    }
  }
}
