import { BrowserContext } from 'playwright';
import { BasePortalAdapter } from './base';
import { JobQuery, PortalScanResult, RawScrapedJob } from '../types';

const MAX_JOBS = Math.min(Number(process.env.JOBHUNT_HIRIST_LIMIT || 40) || 40, 60);

function slug(value: string) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function searchUrl(query: JobQuery, variant: string) {
  const q = encodeURIComponent(variant);
  const loc = query.locations?.[0] && !/anywhere|remote/i.test(query.locations[0])
    ? encodeURIComponent(query.locations[0])
    : '';
  return loc
    ? `https://www.hirist.tech/search?q=${q}&l=${loc}`
    : `https://www.hirist.tech/search?q=${q}`;
}

export class HiristAdapter extends BasePortalAdapter {
  identifier = 'hirist';
  displayName = 'Hirist';

  async healthCheck(context: BrowserContext): Promise<boolean> {
    const page = await context.newPage();
    try {
      const isUp = await this.safeNavigate(page, 'https://www.hirist.tech/', 15_000);
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
    const variants = query.titleVariants.slice(0, 3).filter(Boolean);
    if (!variants.length) variants.push('software engineer');

    try {
      for (const variant of variants) {
        if (jobs.length >= MAX_JOBS) break;

        const url = searchUrl(query, variant);
        onProgress?.(`Hirist: searching "${variant}"`);
        const ok = await this.safeNavigate(page, url, 30_000);
        if (!ok) continue;

        const gate = await this.detectAccessGate(page);
        if (gate) throw new Error(`${gate}: Hirist blocked this search`);

        await this.randomDelay(1_200, 2_000);

        // Hirist has multiple possible class naming conventions
        const { elements: cards } = await this.selectorChain(page, [
          '.jlr',
          '.job-listing',
          '[class*="job-card"]',
          '[class*="jobCard"]',
          'li.job',
          'article.job',
          '[class*="listing"]',
        ]);

        onProgress?.(`Hirist: ${cards.length} listings for "${variant}"`);

        for (const card of cards.slice(0, MAX_JOBS)) {
          try {
            const titleEl = await this.firstSelector(card, [
              'a.job-title', 'h2 a', 'h3 a', '.title a',
              'a[href*="/jobs/"]', 'a[href*="/job-"]',
            ]);
            const companyEl = await this.firstSelector(card, [
              '.comp-name', '.company', '.company-name',
              '[class*="company"]', 'a[href*="/company/"]',
            ]);
            const locationEl = await this.firstSelector(card, [
              '.location', '[class*="location"]', '.loc',
            ]);
            const expEl = await this.firstSelector(card, ['.exp', '.experience', '[class*="exp"]']);
            const snippetEl = await this.firstSelector(card, ['.desc', '.description', '.job-desc']);

            const title = titleEl ? (await titleEl.innerText()).trim() : '';
            const href = titleEl ? await titleEl.getAttribute('href') : null;
            const company = companyEl ? (await companyEl.innerText()).trim() : 'Company not listed';
            if (!title || !href) continue;

            const jobUrl = href.startsWith('http') ? href : `https://www.hirist.tech${href}`;
            const key = jobUrl.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);

            jobs.push({
              portal: this.identifier,
              externalId: href.match(/\/(\d+)\/?$/)?.[1],
              title,
              company,
              location: locationEl ? (await locationEl.innerText()).trim() : query.locations?.[0],
              experienceText: expEl ? (await expEl.innerText()).trim() : undefined,
              snippet: snippetEl
                ? (await snippetEl.innerText()).replace(/\s+/g, ' ').trim().slice(0, 800)
                : undefined,
              url: jobUrl,
              applyUrl: jobUrl,
              rawPayload: { provider: 'hirist', variant },
            });
            if (jobs.length >= MAX_JOBS) break;
          } catch { /* skip malformed card */ }
        }

        if (cards.length === 0) {
          const linked = await this.extractJobLinksFromPage(page, query, {
            hrefIncludes: ['/jobs/', '/job-', '/it-jobs'],
            max: 20,
            defaultLocation: query.locations?.[0] || 'India',
          });
          for (const job of linked) {
            if (!seen.has(job.url.toLowerCase())) {
              seen.add(job.url.toLowerCase());
              jobs.push(job);
            }
          }
        }
      }

      if (jobs.length === 0) throw new Error('empty_results: Hirist returned no listings for this query');
      return this.formatResult(jobs);
    } catch (e: any) {
      return this.formatFailureResult(jobs, e, page);
    } finally {
      await page.close();
    }
  }
}
