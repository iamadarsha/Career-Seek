import { BrowserContext } from 'playwright';
import { BasePortalAdapter } from './base';
import { JobQuery, PortalScanResult, RawScrapedJob } from '../types';

const MAX_JOBS = Math.min(Number(process.env.JOBHUNT_PEERLIST_LIMIT || 30) || 30, 50);

function searchUrl(query: JobQuery) {
  const params = new URLSearchParams({ search: query.titleVariants[0] || 'product manager' });
  if (query.isRemote) params.set('type', 'remote');
  return `https://peerlist.io/jobs?${params.toString()}`;
}

function extractFromNextData(nextData: any, portalId: string): RawScrapedJob[] {
  const jobs: RawScrapedJob[] = [];
  const jobsList: any[] =
    nextData?.props?.pageProps?.jobs ||
    nextData?.props?.pageProps?.data?.jobs ||
    nextData?.props?.pageProps?.initialData?.jobs ||
    [];

  for (const job of jobsList) {
    const title = String(job.title || job.designation || '').trim();
    const company = String(job.company?.name || job.companyName || job.organization || '').trim();
    const slug = job.slug || job.id || '';
    const jobUrl = job.url || job.jobUrl || (slug ? `https://peerlist.io/jobs/${slug}` : '');
    if (!title || !company || !jobUrl) continue;

    jobs.push({
      portal: portalId,
      externalId: String(job.id || job.slug || '').trim() || undefined,
      title,
      company,
      location: String(job.location || job.city || '').trim() || undefined,
      isRemote: Boolean(job.remote || job.isRemote || /remote/i.test(String(job.type || ''))),
      url: jobUrl,
      applyUrl: String(job.applyUrl || jobUrl).trim(),
      snippet: String(job.description || job.about || '').replace(/\s+/g, ' ').trim().slice(0, 1_200),
      employmentType: job.type || job.jobType,
      rawPayload: { provider: 'peerlist', job },
    });
  }
  return jobs;
}

export class PeerlistAdapter extends BasePortalAdapter {
  identifier = 'peerlist';
  displayName = 'Peerlist';

  async healthCheck(context: BrowserContext): Promise<boolean> {
    const page = await context.newPage();
    try {
      const isUp = await this.safeNavigate(page, 'https://peerlist.io/jobs', 15_000);
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
      onProgress?.('Opening Peerlist jobs');
      const ok = await this.safeNavigate(page, url, 30_000);
      if (!ok) throw new Error('browser_error: peerlist.io did not load');

      const gate = await this.detectAccessGate(page);
      if (gate) throw new Error(`${gate}: Peerlist is gating job search`);

      await page.waitForTimeout(2_500);

      // SSR payload first — Peerlist is Next.js
      const nextData = await page.evaluate(() => {
        try {
          const el = document.getElementById('__NEXT_DATA__');
          return el ? JSON.parse(el.textContent || '{}') : null;
        } catch { return null; }
      }).catch(() => null);

      if (nextData) {
        const extracted = extractFromNextData(nextData, this.identifier);
        if (extracted.length > 0) {
          onProgress?.(`Peerlist: ${extracted.length} jobs from SSR data`);
          jobs.push(...extracted.slice(0, MAX_JOBS));
        }
      }

      // DOM fallback
      if (jobs.length === 0) {
        await page.waitForSelector(
          '[class*="JobCard"], [class*="job-card"], [class*="jobCard"], [data-job-id], article',
          { timeout: 8_000 },
        ).catch(() => undefined);

        const { elements: cards } = await this.selectorChain(page, [
          '[class*="JobCard"]',
          '[class*="job-card"]',
          '[class*="jobCard"]',
          '[data-job-id]',
          'article',
        ]);

        onProgress?.(`Peerlist: ${cards.length} DOM job cards`);

        for (const card of cards.slice(0, MAX_JOBS)) {
          try {
            const titleEl = await this.firstSelector(card, ['h3', 'h2', '[class*="title"]', 'a[href*="/jobs/"]']);
            const companyEl = await this.firstSelector(card, ['[class*="company"]', '[class*="Company"]', 'p']);
            const linkEl = await this.firstSelector(card, ['a[href*="/jobs/"]', 'a[href]']);
            const locationEl = await this.firstSelector(card, ['[class*="location"]', '[class*="Location"]']);

            const title = titleEl ? (await titleEl.innerText()).trim() : '';
            const company = companyEl ? (await companyEl.innerText()).trim() : 'Company not listed';
            const href = linkEl ? await linkEl.getAttribute('href') : null;
            if (!title || !href) continue;

            const jobUrl = href.startsWith('http') ? href : `https://peerlist.io${href}`;
            if (seen.has(jobUrl)) continue;
            seen.add(jobUrl);

            jobs.push({
              portal: this.identifier,
              title,
              company,
              location: locationEl ? (await locationEl.innerText()).trim() : query.locations?.[0],
              url: jobUrl,
              applyUrl: jobUrl,
              rawPayload: { provider: 'peerlist-dom' },
            });
          } catch { /* skip */ }
        }
      }

      if (jobs.length === 0) {
        const linked = await this.extractJobLinksFromPage(page, query, {
          hrefIncludes: ['/jobs/'],
          max: 20,
          defaultLocation: query.locations?.[0] || 'India',
        });
        jobs.push(...linked);
      }

      if (jobs.length === 0) throw new Error('empty_results: Peerlist returned no job listings');
      return this.formatResult(jobs);
    } catch (e: any) {
      return this.formatFailureResult(jobs, e, page);
    } finally {
      await page.close();
    }
  }
}
