import fs from 'fs';
import path from 'path';
import { BrowserContext } from 'playwright';
import { JobQuery, PortalScanResult, RawScrapedJob } from '../types';
import { BasePortalAdapter } from './base';

function q(value: string) {
  return encodeURIComponent(value);
}

function title(query: JobQuery) {
  return query.titleVariants[0] || 'product manager';
}

function location(query: JobQuery) {
  const loc = query.locations?.[0] || 'India';
  return /anywhere|remote/i.test(loc) ? 'India' : loc;
}

function vendorPathExists() {
  return fs.existsSync(path.join(process.cwd(), 'vendors', 'JobSpy'));
}

export class JobSpyFallbackAdapter extends BasePortalAdapter {
  identifier = 'jobspy';
  displayName = 'JobSpy-style multi-board fallback';

  async healthCheck(context: BrowserContext): Promise<boolean> {
    const page = await context.newPage();
    try {
      const googleOk = await this.safeNavigate(page, 'https://www.google.com/search?q=jobs+India', 15000);
      return googleOk && vendorPathExists();
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  async scrape(context: BrowserContext, query: JobQuery, onProgress?: (msg: string) => void): Promise<PortalScanResult> {
    const page = await context.newPage();
    const jobs: RawScrapedJob[] = [];
    const searched = [
      {
        board: 'google',
        url: `https://www.google.com/search?q=${q(`${title(query)} jobs ${location(query)} linkedin indeed glassdoor`)}`,
        includes: ['linkedin.com/jobs', 'indeed.com', 'indeed.co.in', 'glassdoor.co.in', '/jobs/', '/job/'],
      },
      {
        board: 'linkedin_guest',
        url: `https://www.linkedin.com/jobs/search?keywords=${q(title(query))}&location=${q(location(query))}`,
        includes: ['linkedin.com/jobs/view', '/jobs/view'],
      },
      {
        board: 'glassdoor',
        url: `https://www.glassdoor.co.in/Job/india-${title(query).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-jobs-SRCH_IL.0,5_IN115.htm`,
        includes: ['glassdoor.co.in/job-listing', '/job-listing/'],
      },
    ];

    try {
      for (const board of searched) {
        onProgress?.(`Trying JobSpy-style fallback: ${board.board}`);
        const ok = await this.safeNavigate(page, board.url, 30000);
        if (!ok) continue;

        const gate = await this.detectAccessGate(page);
        if (gate) continue;

        const extracted = await this.extractJobLinksFromPage(page, query, {
          hrefIncludes: board.includes,
          max: 8,
          defaultLocation: location(query),
        });

        for (const job of extracted) {
          jobs.push({
            ...job,
            portal: this.identifier,
            rawPayload: {
              ...(job.rawPayload || {}),
              jobSpyStyleFallback: true,
              board: board.board,
              searchedUrl: board.url,
              vendoredJobSpyPresent: vendorPathExists(),
            },
          });
        }
      }

      if (jobs.length === 0) {
        throw new Error(
          vendorPathExists()
            ? 'empty_results: JobSpy-style fallback returned no matching links'
            : 'dependency_missing: vendors/JobSpy is not present; direct JobSpy execution is intentionally disabled',
        );
      }

      return this.formatResult(jobs.slice(0, 20));
    } catch (error) {
      return this.formatFailureResult(jobs, error, page);
    } finally {
      await page.close().catch(() => undefined);
    }
  }
}
