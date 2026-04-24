import { BasePortalAdapter } from './base';
import { JobQuery, PortalScanResult, RawScrapedJob } from '../types';
import { BrowserContext } from 'playwright';

export class LinkedInAdapter extends BasePortalAdapter {
  identifier = 'linkedin';
  displayName = 'LinkedIn';

  async healthCheck(context: BrowserContext): Promise<boolean> {
    const page = await context.newPage();
    const isUp = await this.safeNavigate(page, 'https://www.linkedin.com/jobs');
    await page.close();
    return isUp;
  }

  async scrape(context: BrowserContext, query: JobQuery, onProgress?: (msg: string) => void): Promise<PortalScanResult> {
    const page = await context.newPage();
    const jobs: RawScrapedJob[] = [];
    
    try {
      // Build the search URL
      const searchParams = new URLSearchParams();
      // Join keywords for the primary search query
      const keywords = [...query.titleVariants, ...(query.keywords || [])].join(' ');
      searchParams.append('keywords', keywords);
      
      if (query.locations && query.locations.length > 0) {
        searchParams.append('location', query.locations[0]); // Simply use the first location
      }
      
      if (query.isRemote) {
        searchParams.append('f_WT', '2'); // 2 is remote on LinkedIn
      }

      const url = `https://www.linkedin.com/jobs/search?${searchParams.toString()}`;
      
      onProgress?.(`Navigating to ${url}`);
      const success = await this.safeNavigate(page, url);
      if (!success) {
        throw new Error('Failed to load LinkedIn jobs page');
      }

      await this.randomDelay(2000, 4000);
      
      // Simple scrape for unauthenticated LinkedIn (limits to ~25 jobs initially)
      const jobCards = await page.$$('.jobs-search__results-list li');
      onProgress?.(`Found ${jobCards.length} job cards on LinkedIn`);

      for (let i = 0; i < Math.min(jobCards.length, 10); i++) { // Limit to 10 for safety/speed in local runs
        try {
          const card = jobCards[i];
          const titleEl = await card.$('.base-search-card__title');
          const companyEl = await card.$('.base-search-card__subtitle');
          const locationEl = await card.$('.job-search-card__location');
          const urlEl = await card.$('.base-card__full-link');
          const dateEl = await card.$('.job-search-card__listdate');

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
            postedDateText: postedDateText?.trim()
          });
          
        } catch (cardError) {
          console.warn('[LinkedIn] Error parsing card', cardError);
        }
      }

      return this.formatResult(jobs);

    } catch (e: any) {
      return this.formatResult(jobs, e.message);
    } finally {
      await page.close();
    }
  }
}
