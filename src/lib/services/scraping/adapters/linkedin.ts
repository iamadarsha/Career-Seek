import { BasePortalAdapter } from './base';
import { JobQuery, PortalScanResult, RawScrapedJob } from '../types';
import { BrowserContext } from 'playwright';
import { sourceCapabilities } from '../source-universe';
import { classifySourceFailure } from '../failures';

const LINKEDIN_CAPABILITIES = sourceCapabilities('linkedin');
const LINKEDIN_SOURCE_HEALTH = {
  label: 'fallback_only',
  localOnlySignal: true,
  reason: 'LinkedIn live browser search and direct job URLs can auth-gate; public guest HTML is used when available.',
  suggestedSourceIds: ['company_ats', 'official', 'jobspy', 'manual_url'],
};

export class LinkedInAdapter extends BasePortalAdapter {
  identifier = 'linkedin';
  displayName = 'LinkedIn';
  private readonly maxJobs = Number(process.env.JOBHUNT_SOURCE_LIMIT || 30);
  private static sessionAuthenticated = false;

  /**
   * Attempts to log in using LINKEDIN_EMAIL / LINKEDIN_PASSWORD env vars.
   * Returns true if login succeeded. Idempotent — skips if already done this session.
   */
  private async loginWithCredentials(context: BrowserContext, onProgress?: (msg: string) => void): Promise<boolean> {
    if (LinkedInAdapter.sessionAuthenticated) return true;
    const email = process.env.LINKEDIN_EMAIL?.trim();
    const password = process.env.LINKEDIN_PASSWORD?.trim();
    if (!email || !password) return false;

    const page = await context.newPage();
    try {
      onProgress?.('LinkedIn: attempting credential login…');
      await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.fill('#username', email);
      await page.fill('#password', password);
      await page.click('[type="submit"]');
      await page.waitForURL(/linkedin\.com\/(feed|jobs|mynetwork|checkpoint)/, { timeout: 15_000 }).catch(() => {});
      const url = page.url();
      if (/\/checkpoint\/challenge/i.test(url)) {
        onProgress?.('LinkedIn: login hit a verification challenge — credential login unavailable.');
        return false;
      }
      if (/\/(feed|jobs|mynetwork)/i.test(url)) {
        LinkedInAdapter.sessionAuthenticated = true;
        onProgress?.('LinkedIn: credential login succeeded.');
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      await page.close();
    }
  }

  async healthCheck(context: BrowserContext): Promise<boolean> {
    const page = await context.newPage();
    try {
      const isUp = await this.safeNavigate(page, 'https://www.linkedin.com/jobs');
      const gate = isUp ? await this.detectAccessGate(page) : null;
      return isUp && !gate;
    } finally {
      await page.close();
    }
  }

  async scrape(context: BrowserContext, query: JobQuery, onProgress?: (msg: string) => void): Promise<PortalScanResult> {
    let guestFailureCode = '';
    const guestJobs = await this.scrapeGuestApi(context, query, onProgress).catch((error) => {
      const guestFailure = classifySourceFailure(error);
      guestFailureCode = guestFailure.code;
      onProgress?.(`LinkedIn public guest fallback unavailable (${guestFailureCode}); browser search will be tried.`);
      return null;
    });
    if (guestJobs?.length) {
      return this.formatResult(guestJobs);
    }

    const page = await context.newPage();
    const jobs: RawScrapedJob[] = [];

    try {
      const searchParams = new URLSearchParams();
      const keywords = [...query.titleVariants, ...(query.keywords || [])].join(' ');
      searchParams.append('keywords', keywords);

      if (query.locations && query.locations.length > 0) {
        searchParams.append('location', query.locations[0]);
      }

      if (query.isRemote) {
        searchParams.append('f_WT', '2');
      }

      const url = `https://www.linkedin.com/jobs/search?${searchParams.toString()}`;

      onProgress?.(`Navigating to ${url}`);
      const success = await this.safeNavigate(page, url);
      if (!success) {
        throw new Error('Failed to load LinkedIn jobs page');
      }

      const gate = await this.detectAccessGate(page);
      if (gate) {
        // Try credential login before giving up
        const loggedIn = await this.loginWithCredentials(context, onProgress);
        if (loggedIn) {
          const retrySuccess = await this.safeNavigate(page, url);
          if (!retrySuccess) throw new Error('auth_gate: LinkedIn search unavailable after credential login.');
          const gateAfterLogin = await this.detectAccessGate(page);
          if (gateAfterLogin) throw new Error('auth_gate: LinkedIn still gated after credential login.');
          // continue to scrape below
        } else {
          const prior = guestFailureCode ? ` Public guest fallback also reported ${guestFailureCode}.` : '';
          const hint = process.env.LINKEDIN_EMAIL ? '' : ' Set LINKEDIN_EMAIL and LINKEDIN_PASSWORD in .env.local to bypass.';
          throw new Error(gate === 'blocked'
            ? `blocked: LinkedIn appears to be blocking automated access.${prior}${hint}`
            : `auth_gate: LinkedIn requires sign-in for this search.${prior}${hint}`);
        }
      }

      await this.randomDelay(2000, 4000);
      
      // Simple scrape for unauthenticated LinkedIn (limits to ~25 jobs initially)
      const { elements: jobCards } = await this.selectorChain(page, [
        '.jobs-search__results-list li',
        'ul.jobs-search__results-list > li',
        '.base-search-card',
        '[data-entity-urn*="jobPosting"]',
      ]);
      onProgress?.(`Found ${jobCards.length} job cards on LinkedIn`);
      if (jobCards.length === 0) {
        throw new Error('selector_not_found: no LinkedIn job cards matched fallback chain');
      }

      for (let i = 0; i < Math.min(jobCards.length, this.maxJobs); i++) {
        try {
          const card = jobCards[i];
          const titleEl = await this.firstSelector(card, ['.base-search-card__title', 'h3', 'a[href*="/jobs/view/"]']);
          const companyEl = await this.firstSelector(card, ['.base-search-card__subtitle', 'h4', '.hidden-nested-link']);
          const locationEl = await this.firstSelector(card, ['.job-search-card__location', '.job-card-container__metadata-item']);
          const urlEl = await this.firstSelector(card, ['.base-card__full-link', 'a[href*="/jobs/view/"]']);
          const dateEl = await this.firstSelector(card, ['.job-search-card__listdate', 'time']);

          const title = titleEl ? await titleEl.innerText() : 'Unknown Title';
          const company = companyEl ? await companyEl.innerText() : 'Unknown Company';
          const location = locationEl ? await locationEl.innerText() : undefined;
          const jobUrl = urlEl ? await urlEl.getAttribute('href') : url;
          const postedDateText = dateEl ? await dateEl.innerText() : undefined;

          // Extract ID from URL if possible
          let externalId;
          if (jobUrl) {
             const match = jobUrl.match(/view\/(\d+)/);
             if (match) externalId = match[1];
          }

          jobs.push({
            portal: this.identifier,
            title: title.trim(),
            company: company.trim(),
            location: location?.trim(),
            url: jobUrl?.split('?')[0] || url, // Clean URL
            externalId,
            postedDateText: postedDateText?.trim(),
            rawPayload: {
              extraction: 'linkedin_public_browser_page',
              searchedUrl: url,
              sourceCapabilities: LINKEDIN_CAPABILITIES,
              sourceHealth: LINKEDIN_SOURCE_HEALTH,
            },
          });
          
        } catch (cardError) {
          console.warn('[LinkedIn] Error parsing card', cardError);
        }
      }

      if (jobs.length === 0) {
        throw new Error('parse_error: LinkedIn cards were found but no usable jobs could be parsed');
      }

      return this.formatResult(jobs);

    } catch (e: any) {
      return this.formatFailureResult(jobs, e, page);
    } finally {
      await page.close();
    }
  }

  private async scrapeGuestApi(context: BrowserContext, query: JobQuery, onProgress?: (msg: string) => void): Promise<RawScrapedJob[]> {
    const jobs: RawScrapedJob[] = [];
    const seen = new Set<string>();
    const keywords = [...query.titleVariants, ...(query.keywords || [])].filter(Boolean).join(' ') || 'product manager';
    const locations = query.locations?.length ? query.locations.slice(0, 5) : ['India'];

    for (const location of locations) {
      for (let start = 0; jobs.length < this.maxJobs && start <= 75; start += 25) {
        const params = new URLSearchParams({
          keywords,
          location,
          start: String(start),
          f_TPR: 'r604800',
        });
        if (query.isRemote) params.set('f_WT', '2');

        const url = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?${params.toString()}`;
        onProgress?.(`Querying LinkedIn public jobs page ${start / 25 + 1} for ${location}`);
        const response = await (context as any).request.get(url, {
          headers: {
            accept: 'text/html,application/xhtml+xml',
            'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
          },
          timeout: 30_000,
        });

        if (response.status() === 401 || response.status() === 403) {
          throw new Error('auth_gate: LinkedIn guest jobs require sign-in for this query');
        }
        if (response.status() === 429) {
          throw new Error('blocked: LinkedIn guest jobs rate-limited this request');
        }
        if (!response.ok()) {
          throw new Error(`browser_error: LinkedIn guest jobs returned HTTP ${response.status()}`);
        }

        const html = await response.text();
        if (!html.trim()) break;

        const page = await context.newPage();
        try {
          await page.setContent(`<ul class="jobs-search__results-list">${html}</ul>`, { waitUntil: 'domcontentloaded' });
          const cards = await page.$$('.base-search-card, li, [data-entity-urn*="jobPosting"]');
          if (!cards.length) break;

          for (const card of cards) {
            const job = await this.parseCard(card, url);
            if (job) {
              const key = job.externalId || job.url || `${job.title}:${job.company}:${job.location || ''}`;
              if (!seen.has(key)) {
                seen.add(key);
                jobs.push(job);
              }
            }
            if (jobs.length >= this.maxJobs) break;
          }
        } finally {
          await page.close();
        }
      }
    }

    if (jobs.length === 0) {
      throw new Error('empty_results: LinkedIn public jobs returned no usable listings');
    }
    return jobs;
  }

  private async parseCard(card: any, fallbackUrl: string): Promise<RawScrapedJob | null> {
    const titleEl = await this.firstSelector(card, ['.base-search-card__title', 'h3', 'a[href*="/jobs/view/"]']);
    const companyEl = await this.firstSelector(card, ['.base-search-card__subtitle', 'h4', '.hidden-nested-link']);
    const locationEl = await this.firstSelector(card, ['.job-search-card__location', '.job-card-container__metadata-item']);
    const urlEl = await this.firstSelector(card, ['.base-card__full-link', 'a[href*="/jobs/view/"]']);
    const dateEl = await this.firstSelector(card, ['.job-search-card__listdate', 'time']);
    const snippetEl = await this.firstSelector(card, ['.job-search-card__snippet', '.base-search-card__metadata']);

    const title = titleEl ? (await titleEl.innerText()).trim() : '';
    const company = companyEl ? (await companyEl.innerText()).trim() : '';
    const jobUrl = urlEl ? await urlEl.getAttribute('href') : fallbackUrl;
    if (!title || !company || !jobUrl) return null;

    const externalId = jobUrl.match(/view\/(\d+)/)?.[1] || jobUrl.match(/currentJobId=(\d+)/)?.[1];
    return {
      portal: this.identifier,
      title,
      company,
      location: locationEl ? (await locationEl.innerText()).trim() : undefined,
      url: jobUrl.split('?')[0],
      externalId,
      postedDateText: dateEl ? ((await dateEl.getAttribute('datetime')) || (await dateEl.innerText()).trim()) : undefined,
      snippet: snippetEl ? (await snippetEl.innerText()).trim() : undefined,
      rawPayload: {
        extraction: 'linkedin_guest_api_html',
        sourceCapabilities: LINKEDIN_CAPABILITIES,
        sourceHealth: LINKEDIN_SOURCE_HEALTH,
        fallbackUrl,
      },
    };
  }
}
