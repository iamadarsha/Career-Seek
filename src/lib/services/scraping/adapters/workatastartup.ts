import { BrowserContext } from 'playwright';
import { BasePortalAdapter } from './base';
import { JobQuery, PortalScanResult, RawScrapedJob } from '../types';

const MAX_JOBS = Math.min(Number(process.env.JOBHUNT_YC_LIMIT || 40) || 40, 60);

function searchUrl(query: JobQuery) {
  const params = new URLSearchParams({
    demographic: 'any',
    hasEquity: 'any',
    hasSalary: 'any',
    industry: 'any',
    interviewProcess: 'any',
    isHiring: 'true',
    jobType: 'full_time',
    layout: 'list-compact',
    query: query.titleVariants[0] || 'product manager',
    sortBy: 'created_at',
  });
  if (!query.isRemote) params.append('locations[]', 'IN');
  return `https://www.workatastartup.com/companies?${params.toString()}`;
}

function extractFromNextData(nextData: any, portalId: string): RawScrapedJob[] {
  const jobs: RawScrapedJob[] = [];
  const companies: any[] =
    nextData?.props?.pageProps?.companies ||
    nextData?.props?.pageProps?.initialData?.companies ||
    nextData?.props?.pageProps?.data?.companies ||
    [];

  for (const company of companies) {
    const companyName = String(company.name || company.company_name || '').trim();
    const jobsList: any[] = Array.isArray(company.jobs) ? company.jobs
      : Array.isArray(company.openings) ? company.openings : [];

    for (const job of jobsList) {
      const title = String(job.title || job.job_title || '').trim();
      const jobId = String(job.id || job.job_id || '').trim();
      if (!title || !companyName) continue;

      const jobUrl = job.url || (jobId ? `https://www.workatastartup.com/jobs/${jobId}` : '');
      if (!jobUrl) continue;

      const location = String(job.location || job.location_preference || '').trim();
      jobs.push({
        portal: portalId,
        externalId: jobId || undefined,
        title,
        company: companyName,
        location: location || undefined,
        isRemote: /remote|anywhere/i.test(location),
        url: jobUrl,
        applyUrl: jobUrl,
        snippet: String(job.description || job.short_description || '').replace(/\s+/g, ' ').trim().slice(0, 1_200),
        employmentType: job.job_type || 'full_time',
        rawPayload: { provider: 'yc-workatastartup', job },
      });
    }
  }
  return jobs;
}

export class WorkAtStartupAdapter extends BasePortalAdapter {
  identifier = 'workatastartup';
  displayName = 'YC Work at a Startup';

  async healthCheck(context: BrowserContext): Promise<boolean> {
    const page = await context.newPage();
    try {
      const isUp = await this.safeNavigate(page, 'https://www.workatastartup.com/jobs', 20_000);
      const gate = isUp ? await this.detectAccessGate(page) : null;
      return isUp && !gate;
    } finally {
      await page.close();
    }
  }

  async scrape(context: BrowserContext, query: JobQuery, onProgress?: (msg: string) => void): Promise<PortalScanResult> {
    const page = await context.newPage();
    const jobs: RawScrapedJob[] = [];
    const url = searchUrl(query);

    try {
      onProgress?.('Opening YC Work at a Startup search');
      const ok = await this.safeNavigate(page, url, 40_000);
      if (!ok) throw new Error('browser_error: workatastartup.com did not load');

      const gate = await this.detectAccessGate(page);
      if (gate) throw new Error(`${gate}: YC Work at a Startup is gating this search`);

      await page.waitForTimeout(3_000);

      // Prefer SSR payload — no selectors needed, structured data
      const nextData = await page.evaluate(() => {
        try {
          const el = document.getElementById('__NEXT_DATA__');
          return el ? JSON.parse(el.textContent || '{}') : null;
        } catch { return null; }
      }).catch(() => null);

      if (nextData) {
        const extracted = extractFromNextData(nextData, this.identifier);
        if (extracted.length > 0) {
          onProgress?.(`YC: ${extracted.length} jobs from SSR data`);
          jobs.push(...extracted.slice(0, MAX_JOBS));
        }
      }

      // DOM fallback — company cards each contain job listing links
      if (jobs.length === 0) {
        const cards = await page.$$('.company-card, [class*="CompanyCard"], [data-company-id]').catch(() => []);
        onProgress?.(`YC: ${cards.length} company blocks, scraping DOM`);

        for (const card of cards) {
          if (jobs.length >= MAX_JOBS) break;
          const companyEl = await this.firstSelector(card, ['h2', 'h3', '[class*="company-name"]', 'a[href*="/company/"]']);
          const company = companyEl ? (await companyEl.innerText()).trim() : 'YC Startup';

          const jobLinks = await card.$$('a[href*="/jobs/"]').catch(() => []);
          for (const link of jobLinks) {
            const title = (await link.innerText()).trim();
            const href = await link.getAttribute('href');
            if (!title || !href) continue;
            const jobUrl = href.startsWith('http') ? href : `https://www.workatastartup.com${href}`;
            jobs.push({
              portal: this.identifier,
              externalId: href.match(/\/jobs\/(\d+)/)?.[1],
              title,
              company,
              url: jobUrl,
              applyUrl: jobUrl,
              rawPayload: { provider: 'yc-workatastartup-dom' },
            });
            if (jobs.length >= MAX_JOBS) break;
          }
        }
      }

      // Broad link extraction as last resort
      if (jobs.length === 0) {
        const linked = await this.extractJobLinksFromPage(page, query, {
          hrefIncludes: ['/jobs/'],
          max: 20,
          defaultLocation: query.locations?.[0] || 'India',
        });
        jobs.push(...linked);
      }

      if (jobs.length === 0) throw new Error('empty_results: YC Work at a Startup returned no listings for this query');
      return this.formatResult(jobs);
    } catch (e: any) {
      return this.formatFailureResult(jobs, e, page);
    } finally {
      await page.close();
    }
  }
}
