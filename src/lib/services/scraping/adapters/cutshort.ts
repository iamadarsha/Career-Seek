import { BrowserContext } from 'playwright';
import { BasePortalAdapter } from './base';
import { JobQuery, PortalScanResult, RawScrapedJob } from '../types';

const MAX_JOBS = Math.min(Number(process.env.JOBHUNT_CUTSHORT_LIMIT || 40) || 40, 60);

function searchUrl(query: JobQuery) {
  const params = new URLSearchParams({ keyword: query.titleVariants[0] || 'product manager' });
  const loc = (query.locations?.[0] || '').replace(/anywhere|remote/i, '').trim();
  if (loc) params.set('city', loc);
  if (query.isRemote) params.set('remote', '1');
  return `https://cutshort.io/jobs?${params.toString()}`;
}

export class CutshortAdapter extends BasePortalAdapter {
  identifier = 'cutshort';
  displayName = 'Cutshort';

  async healthCheck(context: BrowserContext): Promise<boolean> {
    const page = await context.newPage();
    try {
      const isUp = await this.safeNavigate(page, 'https://cutshort.io/jobs', 15_000);
      const gate = isUp ? await this.detectAccessGate(page) : null;
      return isUp && !gate;
    } finally {
      await page.close();
    }
  }

  async scrape(context: BrowserContext, query: JobQuery, onProgress?: (msg: string) => void): Promise<PortalScanResult> {
    const page = await context.newPage();
    const jobs: RawScrapedJob[] = [];
    const seen = new Set<string>();
    const url = searchUrl(query);

    try {
      onProgress?.('Opening Cutshort job search');
      const ok = await this.safeNavigate(page, url, 35_000);
      if (!ok) throw new Error('browser_error: cutshort.io did not load');

      const gate = await this.detectAccessGate(page);
      if (gate) throw new Error(`${gate}: Cutshort is gating this search`);

      // Cutshort is a Vue SPA — wait for job cards to render
      await page.waitForSelector(
        '[class*="job-card"], [class*="jobCard"], [class*="JobCard"], [data-job], .job-listing-card',
        { timeout: 12_000 },
      ).catch(() => undefined);

      await this.randomDelay(1_500, 2_500);

      const { elements: cards } = await this.selectorChain(page, [
        '[class*="job-card"]',
        '[class*="jobCard"]',
        '[class*="JobCard"]',
        '[data-job]',
        '.job-listing-card',
        'ul.jobs li',
      ]);

      onProgress?.(`Cutshort: ${cards.length} job cards`);

      for (const card of cards.slice(0, MAX_JOBS)) {
        try {
          const titleEl = await this.firstSelector(card, [
            'a[href*="/jobs/"]', 'h3 a', 'h2 a',
            '[class*="title"] a', '[class*="job-title"]',
          ]);
          const companyEl = await this.firstSelector(card, [
            '[class*="company"]', '[class*="Company"]',
            'a[href*="/company/"]', '.company-name',
          ]);
          const locationEl = await this.firstSelector(card, [
            '[class*="location"]', '[class*="Location"]', '.location',
          ]);
          const expEl = await this.firstSelector(card, ['[class*="experience"]', '[class*="exp"]']);
          const snippetEl = await this.firstSelector(card, ['[class*="desc"]', '[class*="about"]', 'p']);

          const title = titleEl ? (await titleEl.innerText()).trim() : '';
          const href = titleEl ? await titleEl.getAttribute('href') : null;
          const company = companyEl ? (await companyEl.innerText()).trim() : 'Company not listed';
          if (!title || !href) continue;

          const jobUrl = href.startsWith('http') ? href : `https://cutshort.io${href}`;
          if (seen.has(jobUrl.toLowerCase())) continue;
          seen.add(jobUrl.toLowerCase());

          jobs.push({
            portal: this.identifier,
            externalId: href.split('/').filter(Boolean).pop(),
            title,
            company,
            location: locationEl ? (await locationEl.innerText()).trim() : query.locations?.[0],
            experienceText: expEl ? (await expEl.innerText()).trim() : undefined,
            snippet: snippetEl
              ? (await snippetEl.innerText()).replace(/\s+/g, ' ').trim().slice(0, 800)
              : undefined,
            url: jobUrl,
            applyUrl: jobUrl,
            rawPayload: { provider: 'cutshort' },
          });
          if (jobs.length >= MAX_JOBS) break;
        } catch { /* skip */ }
      }

      if (jobs.length === 0) {
        const linked = await this.extractJobLinksFromPage(page, query, {
          hrefIncludes: ['/jobs/'],
          max: 20,
          defaultLocation: query.locations?.[0] || 'India',
        });
        jobs.push(...linked);
      }

      if (jobs.length === 0) throw new Error('empty_results: Cutshort returned no listings for this query');
      return this.formatResult(jobs);
    } catch (e: any) {
      return this.formatFailureResult(jobs, e, page);
    } finally {
      await page.close();
    }
  }
}
