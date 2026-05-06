import { BrowserContext } from 'playwright';
import { BasePortalAdapter } from './base';
import { JobQuery, PortalScanResult, RawScrapedJob } from '../types';

const MAX_JOBS = Math.min(Number(process.env.JOBHUNT_OTTA_LIMIT || 30) || 30, 50);

function searchUrl(query: JobQuery) {
  const params = new URLSearchParams({ search_text: query.titleVariants[0] || 'product manager' });
  if (query.isRemote) params.set('remote', 'true');
  return `https://app.otta.com/jobs/search?${params.toString()}`;
}

export class OttaAdapter extends BasePortalAdapter {
  identifier = 'otta';
  displayName = 'Otta';

  async healthCheck(context: BrowserContext): Promise<boolean> {
    const page = await context.newPage();
    try {
      const isUp = await this.safeNavigate(page, 'https://app.otta.com', 15_000);
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
      onProgress?.('Opening Otta job search');
      const ok = await this.safeNavigate(page, url, 40_000);
      if (!ok) throw new Error('browser_error: app.otta.com did not load');

      const gate = await this.detectAccessGate(page);
      if (gate) throw new Error(`${gate}: Otta requires sign-in for full job search`);

      // Otta is a heavy React SPA — wait for content then scroll to trigger lazy load
      await page.waitForSelector('[class*="job"], [data-testid*="job"], [class*="Job"]', {
        timeout: 15_000,
      }).catch(() => undefined);

      await page.evaluate(() => window.scrollBy(0, 2_000));
      await page.waitForTimeout(2_000);

      const { elements: cards } = await this.selectorChain(page, [
        '[class*="JobCard"]',
        '[class*="job-card"]',
        '[data-testid="job-card"]',
        '[class*="JobItem"]',
        '[class*="job-item"]',
        'li[class*="job"]',
      ]);

      onProgress?.(`Otta: ${cards.length} job cards`);

      for (const card of cards.slice(0, MAX_JOBS)) {
        try {
          const titleEl = await this.firstSelector(card, [
            'h3', 'h2', '[class*="title"]', 'a[href*="/jobs/"]',
          ]);
          const companyEl = await this.firstSelector(card, [
            '[class*="company"]', '[class*="Company"]', 'span.company',
          ]);
          const locationEl = await this.firstSelector(card, [
            '[class*="location"]', '[class*="Location"]',
          ]);
          const linkEl = await this.firstSelector(card, ['a[href*="/jobs/"]', 'a[href]']);

          const title = titleEl ? (await titleEl.innerText()).trim() : '';
          const company = companyEl ? (await companyEl.innerText()).trim() : 'Company not listed';
          const href = linkEl ? await linkEl.getAttribute('href') : null;
          if (!title || !href) continue;

          const jobUrl = href.startsWith('http') ? href : `https://app.otta.com${href}`;
          if (seen.has(jobUrl.toLowerCase())) continue;
          seen.add(jobUrl.toLowerCase());

          jobs.push({
            portal: this.identifier,
            externalId: href.split('/').filter(Boolean).pop(),
            title,
            company,
            location: locationEl ? (await locationEl.innerText()).trim() : undefined,
            isRemote: query.isRemote,
            url: jobUrl,
            applyUrl: jobUrl,
            rawPayload: { provider: 'otta' },
          });
          if (jobs.length >= MAX_JOBS) break;
        } catch { /* skip */ }
      }

      if (jobs.length === 0) {
        const linked = await this.extractJobLinksFromPage(page, query, {
          hrefIncludes: ['/jobs/'],
          max: 15,
          defaultLocation: 'India',
        });
        jobs.push(...linked);
      }

      if (jobs.length === 0) throw new Error('empty_results: Otta returned no listings — may require account sign-in');
      return this.formatResult(jobs);
    } catch (e: any) {
      return this.formatFailureResult(jobs, e, page);
    } finally {
      await page.close();
    }
  }
}
