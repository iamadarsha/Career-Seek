import { BrowserContext } from 'playwright';
import { BasePortalAdapter } from './base';
import { JobQuery, PortalScanResult, RawScrapedJob } from '../types';
import { sourceCapabilities } from '../source-universe';

const INSTAHYRE_CAPABILITIES = sourceCapabilities('instahyre');
const INSTAHYRE_SOURCE_HEALTH = {
  label: 'fallback_only',
  localOnlySignal: true,
  reason: 'Instahyre direct job URLs often return Cloudflare 403 outside the rendered search session; search-result context is retained as proof.',
  suggestedSourceIds: ['cutshort', 'hirist', 'iimjobs', 'company_ats', 'manual_url'],
};
const INSTAHYRE_JOB_LIMIT = Math.min(Number(process.env.JOBHUNT_INSTAHYRE_LIMIT || 20) || 20, 40);

function companyFromInstahyreLines(lines: string[], title: string) {
  const pairedLine = lines.find((line) => /\s+[-\u2013\u2014]\s+/.test(line) && line.toLowerCase().includes(title.toLowerCase().split(/\s+/)[0] || ''));
  const company = pairedLine?.match(/^(.+?)\s+[-\u2013\u2014]\s+/)?.[1]?.trim();
  if (company) return company;
  const fallback = lines.find((line) => line !== title && line.length > 2);
  const fallbackCompany = fallback?.match(/^(.+?)\s+[-\u2013\u2014]\s+/)?.[1]?.trim();
  return fallbackCompany || fallback || 'Company not listed';
}

export class InstahyreAdapter extends BasePortalAdapter {
  identifier = 'instahyre';
  displayName = 'Instahyre';

  async healthCheck(context: BrowserContext): Promise<boolean> {
    const page = await context.newPage();
    try {
      const isUp = await this.safeNavigate(page, 'https://www.instahyre.com/jobs/');
      const gate = isUp ? await this.detectAccessGate(page) : null;
      return isUp && !gate;
    } finally {
      await page.close();
    }
  }

  async scrape(context: BrowserContext, query: JobQuery, onProgress?: (msg: string) => void): Promise<PortalScanResult> {
    const page = await context.newPage();
    const jobs: RawScrapedJob[] = [];
    const role = encodeURIComponent(query.titleVariants[0] || 'product manager');
    const location = encodeURIComponent(query.locations?.[0] || 'india');
    const url = `https://www.instahyre.com/search-jobs/?company_size=0&job_type=0&offset=0&search=true&skills=${role}&locations=${location}`;

    try {
      onProgress?.('Opening Instahyre search');
      const ok = await this.safeNavigate(page, url, 45000);
      if (!ok) throw new Error('Instahyre search page did not load');
      const gate = await this.detectAccessGate(page);
      if (gate) throw new Error(`${gate}: Instahyre did not allow this public search`);
      await this.randomDelay(2500, 4500);

      const cards = await page.$$('.job, [class*="job-card"], [class*="opportunity"]');
      onProgress?.(`Found ${cards.length} possible Instahyre cards`);

      for (const card of cards.slice(0, INSTAHYRE_JOB_LIMIT)) {
        try {
          const titleEl = await card.$('a[href*="/job-"], h2, h3');
          const title = titleEl ? (await titleEl.innerText()).trim() : '';
          if (!title || title.length < 4) continue;
          const href = titleEl ? await titleEl.getAttribute('href') : null;
          const text = (await card.innerText()).trim();
          const lines: string[] = text.split('\n').map((line: string) => line.trim()).filter(Boolean);
          jobs.push({
            portal: this.identifier,
            title,
            company: companyFromInstahyreLines(lines, title),
            location: lines.find((line) => /remote|bengaluru|bangalore|mumbai|pune|hyderabad|delhi|india/i.test(line)),
            snippet: lines.slice(0, 7).join(' '),
            url: href?.startsWith('http') ? href : href ? `https://www.instahyre.com${href}` : url,
            applyUrl: href?.startsWith('http') ? href : href ? `https://www.instahyre.com${href}` : url,
            rawPayload: {
              extraction: 'instahyre_search_page_card',
              searchedUrl: url,
              sourceCapabilities: INSTAHYRE_CAPABILITIES,
              sourceHealth: INSTAHYRE_SOURCE_HEALTH,
              liveProof: {
                extractedFrom: 'browser_rendered_search_results',
                directUrlVerification: 'often_403_cloudflare',
                publicSearchUrl: url,
              },
            },
          });
        } catch {
          // Keep scan tolerant; Instahyre markup is not stable.
        }
      }

      if (jobs.length === 0) {
        const extracted = await this.extractJobLinksFromPage(page, query, {
          hrefIncludes: ['/job-', '/jobs/'],
          defaultLocation: query.locations?.[0] || 'India',
        });
        jobs.push(...extracted.map((job) => ({
          ...job,
          applyUrl: job.applyUrl || job.url,
          rawPayload: {
            ...(job.rawPayload || {}),
            searchedUrl: url,
            sourceCapabilities: INSTAHYRE_CAPABILITIES,
            sourceHealth: INSTAHYRE_SOURCE_HEALTH,
            liveProof: {
              extractedFrom: 'browser_rendered_search_results',
              directUrlVerification: 'often_403_cloudflare',
              publicSearchUrl: url,
            },
          },
        })));
      }

      if (jobs.length === 0) {
        throw new Error(cards.length === 0
          ? 'selector_not_found: no Instahyre job cards or job links matched fallback selectors'
          : 'parse_error: Instahyre cards were found but no usable jobs could be parsed');
      }

      return this.formatResult(jobs);
    } catch (error: any) {
      return this.formatFailureResult(jobs, error, page);
    } finally {
      await page.close();
    }
  }
}
