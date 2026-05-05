import { JobQuery, PortalScanResult, RawScrapedJob } from '../types';
import { Page, BrowserContext } from 'playwright';
import { captureFailureSnapshot, classifySourceFailure, sourceFallbackSignal, sourceHealthLabelForFailure } from '../failures';
import { logger } from '@/lib/logger';

type QueryableNode = Page | any;

export abstract class BasePortalAdapter {
  abstract readonly identifier: string;
  abstract readonly displayName: string;

  // Allows checking if the portal is currently reachable/functional
  abstract healthCheck(context: BrowserContext): Promise<boolean>;

  // Executes the actual search and extraction on the portal
  abstract scrape(context: BrowserContext, query: JobQuery, onProgress?: (msg: string) => void): Promise<PortalScanResult>;

  protected delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  protected randomDelay(min: number, max: number): Promise<void> {
    return this.delay(Math.floor(Math.random() * (max - min + 1) + min));
  }

  // Safe navigation wrapper to avoid breaking the whole scan
  protected async safeNavigate(page: Page, url: string, timeout: number = 30000): Promise<boolean> {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
      return true;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (/interrupted by another navigation/i.test(message)) {
        const browserPage = page as any;
        await browserPage.waitForLoadState?.('domcontentloaded', { timeout: Math.min(timeout, 10_000) }).catch(() => undefined);
        const currentUrl = typeof browserPage.url === 'function' ? browserPage.url() : '';
        if (!browserPage.isClosed?.() && currentUrl && currentUrl !== 'about:blank') {
          return true;
        }
      }
      logger.warn({ err: e, portal: this.identifier }, 'Portal navigation failed');
      return false;
    }
  }

  protected async firstSelector(pageOrElement: QueryableNode, selectors: string[]) {
    for (const selector of selectors) {
      const element = await pageOrElement.$(selector).catch(() => null);
      if (element) return element;
    }
    return null;
  }

  protected async selectorChain(pageOrElement: QueryableNode, selectors: string[]) {
    for (const selector of selectors) {
      const elements = await pageOrElement.$$(selector).catch(() => []);
      if (elements.length > 0) return { selector, elements };
    }
    return { selector: null, elements: [] as any[] };
  }

  protected async extractJobLinksFromPage(
    page: Page,
    query: JobQuery,
    options: {
      hrefIncludes: string[];
      max?: number;
      defaultCompany?: string;
      defaultLocation?: string;
    },
  ): Promise<RawScrapedJob[]> {
    const titleTerms = query.titleVariants
      .flatMap((title) => title.toLowerCase().split(/[^a-z0-9]+/))
      .filter((term) => term.length > 2 && !['and', 'the', 'for'].includes(term));
    const usefulTerms = titleTerms.length ? titleTerms : ['product', 'manager'];

      const fallbackArgs = {
      portal: this.identifier,
      hrefIncludes: options.hrefIncludes,
      terms: usefulTerms,
      max: options.max || 12,
      defaultCompany: options.defaultCompany,
      defaultLocation: options.defaultLocation || query.locations?.[0],
    };

    // Keep this as a string expression. tsx/esbuild can inject helper symbols into
    // serialized callbacks, and those helpers do not exist in the browser page.
    const jobs = await (page as any).evaluate(`(() => {
      const args = ${JSON.stringify(fallbackArgs).replace(/</g, '\\u003c')};
      const anchors = Array.from(document.querySelectorAll('a[href]'));
      const seen = new Set();
      const isGeneric = function(value) {
        return /^(apply|view|view job|details|learn more|show more|save|sign in|jobs|careers|search|search jobs|skip to main content|main content|home|privacy|terms|reset|clear|filter|view all)$/i.test(clean(value));
      };
      const clean = function(value) {
        return String(value || '').replace(/\\s+/g, ' ').trim();
      };
      const toTitleCase = function(value) {
        return clean(value).replace(/\\b\\w/g, function(letter) { return letter.toUpperCase(); });
      };
      const looksLikeLocation = function(line) {
        return /remote|india|bengaluru|bangalore|mumbai|pune|hyderabad|delhi|gurgaon|gurugram|noida|chennai|kolkata/i.test(line);
      };
      const looksLikeSalaryOrExperience = function(line) {
        return /₹|rs\\.?|lpa|years?|yrs?|experience/i.test(line);
      };
      const hasRoleNoun = function(value) {
        return /\\b(manager|engineer|developer|designer|analyst|consultant|specialist|architect|scientist|researcher|officer|associate|executive|coordinator|administrator|recruiter|writer)\\b/i.test(value);
      };
      const looksLikeListingPage = function(href, title) {
        try {
          const url = new URL(href);
          const path = clean(url.pathname).toLowerCase();
          const query = clean(url.search).toLowerCase();
          if (/ref=(topnavigation|nav)|keyword=|location=|query=/.test(query)) return true;
          if (/\\/job-search\\/|\\/search\\/|\\/jobs-in-|\\/myshine\\//.test(path)) return true;
          if (/\\/(c|k)\\//.test(path)) return true;
          if (/\\/jobs\\/[^/?#]+-jobs(?:-in-[^/?#]+)?\\/?$/.test(path)) return true;
          if (/\\/latestjob\\/|\\/freejobalert\\//.test(path)) return true;
        } catch {}
        return /^(jobs?|careers?|search results?|view all|all jobs|it & systems|software development|data engineering|data analytics|genai)$/i.test(clean(title));
      };
      const titleFromHref = function(href) {
        try {
          const url = new URL(href);
          const segment = (url.pathname.split('/').filter(Boolean).pop() || '').replace(/\\.[a-z0-9]+$/i, '');
          const withoutPrefix = segment.replace(/^job-\\d+-/i, '');
          const titleSlug = withoutPrefix.split('-at-')[0] || withoutPrefix;
          const title = toTitleCase(decodeURIComponent(titleSlug).replace(/[-_]+/g, ' '));
          return title.length >= 4 ? title : '';
        } catch {
          return '';
        }
      };
      const instahyreDetailsFromLine = function(line) {
        const match = clean(line).match(/^(.+?)\\s+[-\\u2013\\u2014]\\s+(.+?)(?:\\s+Job available in\\s+(.+?)(?:\\s+Founded\\s+in|\\s+View\\s*»|$)|$)/i);
        if (!match) return null;
        return {
          company: clean(match[1]),
          title: clean(match[2]),
          location: clean(match[3])
        };
      };

      return anchors.flatMap(function(anchor) {
        const href = clean(anchor.href);
        if (!href || !args.hrefIncludes.some(function(part) { return href.toLowerCase().includes(String(part).toLowerCase()); })) return [];

        const container = anchor.closest('article, li, section, [data-testid*="job"], [class*="job"], [class*="card"], div') || anchor;
        const rawText = String(container.innerText || anchor.innerText || anchor.textContent || '');
        const text = clean(rawText);
        const linkText = clean(anchor.innerText || anchor.textContent || anchor.getAttribute('aria-label') || anchor.getAttribute('title'));
        const hrefTitle = titleFromHref(href);
        const searchText = clean([text, linkText, hrefTitle, href].join(' ')).toLowerCase();
        if (!args.terms.some(function(term) { return searchText.includes(String(term).toLowerCase()); })) return [];

        const lines = rawText.split(/\\n| {2,}/).map(clean).filter(Boolean).slice(0, 18);
        const instahyreDetails = args.portal === 'instahyre'
          ? instahyreDetailsFromLine(lines.find(function(line) { return /Job available in/i.test(line); }) || text)
          : null;
        const title = !isGeneric(linkText) && linkText.length >= 4 && linkText.length <= 140
          ? linkText
          : hrefTitle || instahyreDetails?.title || lines.find(function(line) {
              return args.terms.some(function(term) { return line.toLowerCase().includes(String(term).toLowerCase()); }) && line.length <= 140;
            });
        if (!title || title.length < 4) return [];
        if (looksLikeListingPage(href, title)) return [];
        const titleLooksJobish = hasRoleNoun(title) || hasRoleNoun(text) || hasRoleNoun(hrefTitle);
        if (!titleLooksJobish) return [];

        const key = href + '|' + title.toLowerCase();
        if (seen.has(key)) return [];
        seen.add(key);

        const companyLine = lines.find(function(line) {
          return line !== title &&
            !looksLikeLocation(line) &&
            !looksLikeSalaryOrExperience(line) &&
            !/posted|apply|save|easy apply/i.test(line) &&
            line.length > 2 &&
            line.length < 80;
        });
        const splitCompany = clean(companyLine).match(/^(.+?)\\s+[-\\u2013\\u2014]\\s+/);
        const company = instahyreDetails?.company || (splitCompany ? clean(splitCompany[1]) : companyLine) || args.defaultCompany || 'Company not listed';

        return [{
          portal: args.portal,
          title: title,
          company: company,
          location: instahyreDetails?.location || lines.find(function(line) { return looksLikeLocation(line) && line.length <= 90; }) || args.defaultLocation,
          salaryText: lines.find(function(line) { return /₹|rs\\.?|lpa/i.test(line); }),
          experienceText: lines.find(function(line) { return /years?|yrs?|experience/i.test(line); }),
          url: href,
          snippet: lines.slice(0, 8).join(' '),
          rawPayload: { extraction: 'anchor_fallback', href: href, lines: lines }
        }];
      }).slice(0, args.max || 12);
    })()`);

    return jobs as RawScrapedJob[];
  }

  protected async detectAccessGate(page: any): Promise<'blocked' | 'auth_gate' | null> {
    const body = await page.$eval('body', (element: any) => element.innerText || '').catch(() => '');
    const title = await page.title?.().catch(() => '') || '';
    const currentUrl = typeof page.url === 'function' ? page.url() : '';
    const html = await page.content?.().catch(() => '') || '';
    const lowerText = `${title}\n${body}`.toLowerCase();
    const lowerUrl = String(currentUrl || '').toLowerCase();
    const lowerMarkup = String(html || '').slice(0, 25_000).toLowerCase();

    if (/linkedin\.com\/authwall|\/uas\/login|\/checkpoint\/|\/login(?:\?|\/|$)|\/account\/login|sessionredirect=/i.test(lowerUrl)) {
      return 'auth_gate';
    }
    if (/\/sorry\/index|google\.com\/sorry|unusual_traffic/i.test(lowerUrl)) {
      return 'blocked';
    }
    if (/captcha|security check|just a moment|unusual traffic|verify (?:that )?you are human|access denied|temporarily blocked|robot check|bot detection|cf-mitigated|challenges\.cloudflare\.com|cloudflare.*challenge/i.test(`${lowerText}\n${lowerMarkup}`)) {
      return 'blocked';
    }
    if (/sign in to (?:continue|view|see|apply)|log in to (?:continue|view|see|apply)|login to continue|authentication required|please log in|you must be logged in|join now to (?:view|see|apply)|create an account to continue/i.test(lowerText)) {
      return 'auth_gate';
    }
    return null;
  }

  protected async formatFailureResult(jobs: RawScrapedJob[], error: unknown, page?: Page): Promise<PortalScanResult> {
    const failure = classifySourceFailure(error);
    const debugSnapshotPath = await captureFailureSnapshot(page, this.identifier, failure.code);
    return {
      portal: this.identifier,
      status: jobs.length > 0 ? 'partial' : 'failed',
      jobs,
      error: failure.message,
      failureCode: failure.code,
      debugSnapshotPath,
      sourceHealthLabel: sourceHealthLabelForFailure(failure.code, jobs.length),
      gracefulFallback: sourceFallbackSignal(this.identifier, failure.code, failure.message, jobs.length),
    };
  }

  // Common wrapper to format results
  protected formatResult(jobs: RawScrapedJob[], error?: string, failureCode?: string, debugSnapshotPath?: string): PortalScanResult {
    const code = failureCode as any;
    return {
      portal: this.identifier,
      status: error ? (jobs.length > 0 ? 'partial' : 'failed') : 'success',
      jobs,
      error,
      failureCode,
      debugSnapshotPath,
      sourceHealthLabel: error && code ? sourceHealthLabelForFailure(code, jobs.length) : undefined,
      gracefulFallback: error && code ? sourceFallbackSignal(this.identifier, code, error, jobs.length) : undefined,
    };
  }
}
