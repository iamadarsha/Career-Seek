import { BasePortalAdapter } from './base';
import { JobQuery, PortalScanResult, RawScrapedJob } from '../types';
import { BrowserContext } from 'playwright';

export class WellfoundAdapter extends BasePortalAdapter {
  identifier = 'wellfound';
  displayName = 'Wellfound';

  async healthCheck(context: BrowserContext): Promise<boolean> {
    const page = await context.newPage();
    const isUp = await this.safeNavigate(page, 'https://wellfound.com/jobs');
    await page.close();
    return isUp;
  }

  async scrape(context: BrowserContext, query: JobQuery, onProgress?: (msg: string) => void): Promise<PortalScanResult> {
    const page = await context.newPage();
    const jobs: RawScrapedJob[] = [];
    
    try {
      // Wellfound public search URL construction is a bit tricky, but they have a robust role search.
      // Often better to search broadly or navigate their role directory.
      // We will do a generic approach here for Phase C proof of concept.
      const roleQuery = query.titleVariants[0] ? encodeURIComponent(query.titleVariants[0].toLowerCase().replace(/\s+/g, '-')) : 'software-engineer';
      const url = `https://wellfound.com/role/l/${roleQuery}`;

      onProgress?.(`Navigating to ${url}`);
      const success = await this.safeNavigate(page, url);
      if (!success) {
        throw new Error('Failed to load Wellfound jobs page');
      }

      const gate = await this.detectAccessGate(page);
      if (gate) throw new Error(gate === 'blocked' ? 'blocked: Wellfound appears to be blocking automated access' : 'auth_gate: Wellfound requires sign-in');

      await this.randomDelay(3000, 5000); // Allow time for SPA load

      // The exact selectors on wellfound change frequently; these are illustrative for Phase C
      const { elements: jobCards } = await this.selectorChain(page, [
        'div[data-test="StartupResult"]',
        '[data-test*="Startup"]',
        '[data-test*="Job"]',
        'section:has(a[href*="/jobs/"])',
      ]);
      onProgress?.(`Found ${jobCards.length} companies/job blocks on Wellfound`);

      for (let i = 0; i < Math.min(jobCards.length, 10); i++) {
        try {
          const card = jobCards[i];
          const companyEl = await this.firstSelector(card, ['h2', 'h3', 'a[href*="/company/"]']);
          const company = companyEl ? await companyEl.innerText() : 'Unknown Company';
          
          // A company card might have multiple jobs
          const { elements: listings } = await this.selectorChain(card, [
            'div[data-test="JobListing"]',
            '[data-test*="JobListing"]',
            'a[href*="/jobs/"]',
          ]);
          
          for (const listing of listings) {
            const titleEl = await this.firstSelector(listing, ['a[data-test="JobListing-title"]', 'a[href*="/jobs/"]', 'h3', 'h4']);
            const locationEl = await this.firstSelector(listing, ['span[data-test="JobListing-location"]', '[class*="location"]']);
            const compensationEl = await this.firstSelector(listing, ['span[data-test="JobListing-compensation"]', '[class*="compensation"]']);
            
            const title = titleEl ? await titleEl.innerText() : 'Unknown Title';
            const location = locationEl ? await locationEl.innerText() : undefined;
            const salaryText = compensationEl ? await compensationEl.innerText() : undefined;
            const jobUrlPath = titleEl ? await titleEl.getAttribute('href') : null;
            const jobUrl = jobUrlPath ? `https://wellfound.com${jobUrlPath}` : url;

            jobs.push({
              portal: this.identifier,
              title: title.trim(),
              company: company.trim(),
              location: location?.trim(),
              salaryText: salaryText?.trim(),
              url: jobUrl
            });
          }
        } catch (cardError) {
          console.warn('[Wellfound] Error parsing card', cardError);
        }
      }

      if (jobs.length === 0) {
        jobs.push(...await this.extractJobLinksFromPage(page, query, {
          hrefIncludes: ['/jobs/', '/job/'],
          defaultLocation: query.locations?.[0] || 'India',
        }));
      }

      if (jobs.length === 0) {
        throw new Error(jobCards.length === 0
          ? 'selector_not_found: no Wellfound job/company blocks or job links matched fallback chain'
          : 'parse_error: Wellfound blocks were found but no usable jobs could be parsed');
      }

      return this.formatResult(jobs);

    } catch (e: any) {
      return this.formatFailureResult(jobs, e, page);
    } finally {
      await page.close();
    }
  }
}
