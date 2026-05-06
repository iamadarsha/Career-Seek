import { BrowserContext } from 'playwright';
import { BasePortalAdapter } from './base';
import { JobQuery, PortalScanResult, RawScrapedJob } from '../types';

const MAX_JOBS = 30;

const CANDIDATE_URLS = [
  'https://growthroles.com/jobs',
  'https://growthroles.com/',
  'https://www.growthroles.com/jobs',
];

export class GrowthRolesAdapter extends BasePortalAdapter {
  identifier = 'growthroles';
  displayName = 'GrowthRoles';

  async healthCheck(context: BrowserContext): Promise<boolean> {
    const page = await context.newPage();
    try {
      for (const url of CANDIDATE_URLS) {
        const isUp = await this.safeNavigate(page, url, 15_000);
        if (isUp) {
          const gate = await this.detectAccessGate(page);
          return !gate;
        }
      }
      return false;
    } finally {
      await page.close();
    }
  }

  async scrape(context: BrowserContext, query: JobQuery, onProgress?: (msg: string) => void): Promise<PortalScanResult> {
    const page = await context.newPage();
    const jobs: RawScrapedJob[] = [];
    const seen = new Set<string>();

    try {
      let loaded = false;
      let loadedUrl = '';
      for (const url of CANDIDATE_URLS) {
        const ok = await this.safeNavigate(page, url, 25_000);
        if (ok) {
          loaded = true;
          loadedUrl = url;
          onProgress?.(`GrowthRoles: loaded ${url}`);
          break;
        }
      }
      if (!loaded) throw new Error('browser_error: growthroles.com did not load');

      const gate = await this.detectAccessGate(page);
      if (gate) throw new Error(`${gate}: GrowthRoles is gating access`);

      await this.randomDelay(1_500, 2_500);

      const { elements: cards } = await this.selectorChain(page, [
        '[class*="job-card"]',
        '[class*="jobCard"]',
        '[class*="job-listing"]',
        '[class*="JobCard"]',
        '.job',
        'article',
        'li.listing',
        '.listing',
      ]);

      onProgress?.(`GrowthRoles: ${cards.length} job elements`);

      for (const card of cards.slice(0, MAX_JOBS)) {
        try {
          const titleEl = await this.firstSelector(card, [
            'h2 a', 'h3 a', 'a[href*="job"]', '.title a',
            '[class*="title"] a', 'a',
          ]);
          const companyEl = await this.firstSelector(card, [
            '.company', '[class*="company"]', '[class*="Company"]', 'span', 'p',
          ]);
          const locationEl = await this.firstSelector(card, ['.location', '[class*="location"]']);

          const title = titleEl ? (await titleEl.innerText()).trim() : '';
          const href = titleEl ? await titleEl.getAttribute('href') : null;
          const company = companyEl ? (await companyEl.innerText()).trim() : 'Startup';
          if (!title || !href) continue;

          const jobUrl = href.startsWith('http') ? href : `https://growthroles.com${href}`;
          if (seen.has(jobUrl.toLowerCase())) continue;
          seen.add(jobUrl.toLowerCase());

          jobs.push({
            portal: this.identifier,
            title,
            company,
            location: locationEl
              ? (await locationEl.innerText()).trim()
              : query.locations?.[0] || 'India',
            url: jobUrl,
            applyUrl: jobUrl,
            rawPayload: { provider: 'growthroles', loadedUrl },
          });
          if (jobs.length >= MAX_JOBS) break;
        } catch { /* skip */ }
      }

      // Broad link fallback — GrowthRoles may use varied structures
      if (jobs.length === 0) {
        const linked = await this.extractJobLinksFromPage(page, query, {
          hrefIncludes: ['/job', '/jobs', '/career', '/apply', '/opening', '/position'],
          max: MAX_JOBS,
          defaultLocation: query.locations?.[0] || 'India',
        });
        jobs.push(...linked);
      }

      if (jobs.length === 0) throw new Error('empty_results: GrowthRoles returned no job listings');
      return this.formatResult(jobs);
    } catch (e: any) {
      return this.formatFailureResult(jobs, e, page);
    } finally {
      await page.close();
    }
  }
}
