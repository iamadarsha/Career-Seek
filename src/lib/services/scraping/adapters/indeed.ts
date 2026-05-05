import { BrowserContext } from 'playwright';
import { BasePortalAdapter } from './base';
import { JobQuery, PortalScanResult, RawScrapedJob } from '../types';
import { sourceCapabilities } from '../source-universe';

const INDEED_CAPABILITIES = sourceCapabilities('indeed');
const INDEED_SOURCE_HEALTH = {
  label: 'fallback_only',
  localOnlySignal: true,
  reason: 'Indeed search pages are often blocked or gated; public RSS is preferred when it responds.',
  suggestedSourceIds: ['company_ats', 'official', 'jobspy', 'manual_url'],
};
const INDEED_JOB_LIMIT = Math.min(Number(process.env.JOBHUNT_INDEED_LIMIT || 25) || 25, 50);

function uniqueVariants(query: JobQuery, limit = 3) {
  const seen = new Set<string>();
  const variants: string[] = [];
  for (const value of query.titleVariants || []) {
    const cleaned = String(value || '').replace(/\s+/g, ' ').trim();
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key)) continue;
    seen.add(key);
    variants.push(cleaned);
    if (variants.length >= limit) break;
  }
  return variants.length ? variants : ['Product Manager'];
}

interface IndeedRssFallbackResult {
  jobs: RawScrapedJob[];
  failure?: Error;
}

export class IndeedAdapter extends BasePortalAdapter {
  identifier = 'indeed';
  displayName = 'Indeed India';

  async healthCheck(context: BrowserContext): Promise<boolean> {
    const page = await context.newPage();
    try {
      const isUp = await this.safeNavigate(page, 'https://in.indeed.com/');
      const gate = isUp ? await this.detectAccessGate(page) : null;
      return isUp && !gate;
    } finally {
      await page.close();
    }
  }

  async scrape(context: BrowserContext, query: JobQuery, onProgress?: (msg: string) => void): Promise<PortalScanResult> {
    const page = await context.newPage();
    const jobs: RawScrapedJob[] = [];
    const primaryRole = uniqueVariants(query, 1)[0];
    const params = new URLSearchParams({
      q: primaryRole,
      l: query.locations?.[0] || 'India',
    });
    const url = `https://in.indeed.com/jobs?${params.toString()}`;

    try {
      onProgress?.(`Opening Indeed India search`);
      const ok = await this.safeNavigate(page, url, 45000);
      if (!ok) {
        const rss = await this.scrapeRssFallback(query, onProgress);
        jobs.push(...rss.jobs);
        if (jobs.length > 0) {
          return this.formatResult(jobs, 'partial_source_failures: Indeed page navigation failed; RSS fallback used', 'partial_source_failures');
        }
        if (rss.failure) throw rss.failure;
        throw new Error('browser_error: Indeed India search page did not load and RSS fallback returned no jobs');
      }
      const gate = await this.detectAccessGate(page);
      if (gate) {
        const rss = await this.scrapeRssFallback(query, onProgress);
        jobs.push(...rss.jobs);
        if (jobs.length > 0) {
          return this.formatResult(jobs, `partial_source_failures: Indeed page reported ${gate}; RSS fallback used`, 'partial_source_failures');
        }
        if (rss.failure) throw new Error(`${gate}: Indeed India did not allow this public search; RSS fallback also failed: ${rss.failure.message}`);
        throw new Error(`${gate}: Indeed India did not allow this public search`);
      }
      await this.randomDelay(2500, 4500);

      const cards = await page.$$('[data-testid="job-card"], .job_seen_beacon, .result');
      onProgress?.(`Found ${cards.length} possible Indeed cards`);

      for (const card of cards.slice(0, INDEED_JOB_LIMIT)) {
        try {
          const titleEl = await card.$('h2 a, a[data-jk], [id^="jobTitle"], h2 span[title], a[href*="/viewjob"]');
          const companyEl = await card.$('[data-testid="company-name"], .companyName');
          const locationEl = await card.$('[data-testid="text-location"], .companyLocation');
          const snippetEl = await card.$('[data-testid="job-snippet"], .job-snippet');
          const title = titleEl ? (await titleEl.innerText()).trim() : '';
          if (!title) continue;
          const href = titleEl ? await titleEl.getAttribute('href') : null;
          jobs.push({
            portal: this.identifier,
            title,
            company: companyEl ? (await companyEl.innerText()).trim() : 'Company not listed',
            location: locationEl ? (await locationEl.innerText()).trim() : undefined,
            snippet: snippetEl ? (await snippetEl.innerText()).trim() : undefined,
            url: href?.startsWith('http') ? href : href ? `https://in.indeed.com${href}` : url,
            rawPayload: {
              extraction: 'indeed_search_page',
              searchedUrl: url,
              sourceCapabilities: INDEED_CAPABILITIES,
              sourceHealth: INDEED_SOURCE_HEALTH,
            },
          });
        } catch {
          // Continue; selectors are deliberately fallback-heavy.
        }
      }

      if (jobs.length === 0) {
        const extracted = await this.extractJobLinksFromPage(page, query, {
          hrefIncludes: ['/viewjob', 'jk=', '/rc/clk'],
          defaultLocation: query.locations?.[0] || 'India',
        });
        jobs.push(...extracted.map((job) => ({
          ...job,
          rawPayload: {
            ...(job.rawPayload || {}),
            searchedUrl: url,
            sourceCapabilities: INDEED_CAPABILITIES,
            sourceHealth: INDEED_SOURCE_HEALTH,
          },
        })));
      }

      if (jobs.length === 0) {
        const rss = await this.scrapeRssFallback(query, onProgress);
        jobs.push(...rss.jobs);
        if (jobs.length > 0) {
          return this.formatResult(jobs, 'partial_source_failures: Indeed page selectors returned no jobs; RSS fallback used', 'partial_source_failures');
        }
        if (rss.failure) throw rss.failure;
      }

      if (jobs.length === 0) {
        throw new Error(cards.length === 0
          ? 'selector_not_found: no Indeed job cards or job links matched fallback selectors'
          : 'parse_error: Indeed cards were found but no usable jobs could be parsed');
      }

      return this.formatResult(jobs);
    } catch (error: any) {
      return this.formatFailureResult(jobs, error, page);
    } finally {
      await page.close();
    }
  }

  private async scrapeRssFallback(query: JobQuery, onProgress?: (msg: string) => void): Promise<IndeedRssFallbackResult> {
    const jobs: RawScrapedJob[] = [];
    const seen = new Set<string>();
    const roleVariants = uniqueVariants(query);

    try {
      onProgress?.('Indeed search page is gated; trying public RSS fallback');
      for (const roleVariant of roleVariants) {
        if (jobs.length >= INDEED_JOB_LIMIT) break;
        const params = new URLSearchParams({
          q: roleVariant,
          l: query.locations?.[0] || 'India',
        });
        const rssUrl = `https://in.indeed.com/rss?${params.toString()}`;
        const response = await fetch(rssUrl, {
          headers: {
            accept: 'application/rss+xml,text/xml,*/*',
            'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          },
        });
        if (response.status === 401 || response.status === 403) {
          return { jobs: [], failure: new Error(`auth_gate: Indeed RSS returned HTTP ${response.status}`) };
        }
        if (response.status === 429) {
          return { jobs: [], failure: new Error('rate_limited: Indeed RSS rate-limited this request') };
        }
        if (!response.ok) {
          continue;
        }
        const xml = await response.text();
        const items = Array.from(xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)).map((match) => match[0]);

        for (const item of items.slice(0, INDEED_JOB_LIMIT)) {
        const title = this.decodeRssTag(item, 'title');
        const link = this.decodeRssTag(item, 'link') || rssUrl;
        const description = this.decodeRssTag(item, 'description');
        const source = this.decodeRssTag(item, 'source');
        const companyMatch = title.match(/\s+-\s+(.+)$/);
        const cleanTitle = title.replace(/\s+-\s+.+$/, '').trim();

        const job = {
          portal: this.identifier,
          title: cleanTitle || title || 'Indeed job',
          company: source || companyMatch?.[1]?.trim() || 'Company not listed',
          location: query.locations?.[0] || 'India',
          snippet: description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 700) || undefined,
          url: link,
          rawPayload: {
            extraction: 'indeed_rss_fallback',
            rssUrl,
            sourceCapabilities: INDEED_CAPABILITIES,
            sourceHealth: INDEED_SOURCE_HEALTH,
          },
        };
        const dedupeKey = `${String(job.url || '').toLowerCase()}::${String(job.title || '').toLowerCase()}`;
        if (job.title && job.url && !seen.has(dedupeKey)) {
          seen.add(dedupeKey);
          jobs.push(job);
        }
        if (jobs.length >= INDEED_JOB_LIMIT) break;
      }
      }
      if (jobs.length === 0) {
        return { jobs: [], failure: new Error('network_error: Indeed RSS fallback request failed') };
      }
      return { jobs };
    } catch {
      return { jobs: [], failure: new Error('network_error: Indeed RSS fallback request failed') };
    }
  }

  private decodeRssTag(item: string, tag: string): string {
    const match = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
    if (!match) return '';
    return match[1]
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }
}
