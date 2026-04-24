import { BasePortalAdapter } from './base';
import { JobQuery, PortalScanResult, RawScrapedJob } from '../types';
import { BrowserContext } from 'playwright';

export class NaukriAdapter extends BasePortalAdapter {
  identifier = 'naukri';
  displayName = 'Naukri';

  async healthCheck(context: BrowserContext): Promise<boolean> {
    const page = await context.newPage();
    const isUp = await this.safeNavigate(page, 'https://www.naukri.com/');
    await page.close();
    return isUp;
  }

  async scrape(context: BrowserContext, query: JobQuery, onProgress?: (msg: string) => void): Promise<PortalScanResult> {
    const page = await context.newPage();
    const jobs: RawScrapedJob[] = [];
    
    try {
      const keywords = encodeURIComponent([...query.titleVariants, ...(query.keywords || [])].join('-'));
      const loc = query.locations && query.locations.length > 0 ? encodeURIComponent(query.locations[0].toLowerCase()) : '';
      
      // Construct Naukri URL (e.g. https://www.naukri.com/ai-product-manager-jobs-in-bangalore)
      let url = `https://www.naukri.com/${keywords}-jobs`;
      if (loc) {
        url += `-in-${loc}`;
      }

      onProgress?.(`Navigating to ${url}`);
      const success = await this.safeNavigate(page, url, 45000); // Naukri can be slow
      if (!success) {
        throw new Error('Failed to load Naukri jobs page');
      }

      await this.randomDelay(3000, 5000); // Wait for the React app to render jobs

      const jobCards = await page.$$('div.srp-jobtuple-wrapper');
      onProgress?.(`Found ${jobCards.length} job cards on Naukri`);

      for (let i = 0; i < Math.min(jobCards.length, 10); i++) {
        try {
          const card = jobCards[i];
          const titleEl = await card.$('a.title');
          const companyEl = await card.$('a.comp-name');
          const locationEl = await card.$('.locWdth');
          const expEl = await card.$('.expwdth');
          const salaryEl = await card.$('.sal');
          const snippetEl = await card.$('.job-desc');

          const title = titleEl ? await titleEl.innerText() : 'Unknown Title';
          const company = companyEl ? await companyEl.innerText() : 'Unknown Company';
          const location = locationEl ? await locationEl.innerText() : undefined;
          const jobUrl = titleEl ? await titleEl.getAttribute('href') : url;
          const experience = expEl ? await expEl.innerText() : undefined;
          const salary = salaryEl ? await salaryEl.innerText() : undefined;
          const snippet = snippetEl ? await snippetEl.innerText() : undefined;

          // Try to get external ID from URL (e.g., .../job-listings-something-123456789)
          let externalId;
          if (jobUrl) {
            const match = jobUrl.match(/-(\d{7,})/);
            if (match) externalId = match[1];
          }

          jobs.push({
            portal: this.identifier,
            title: title.trim(),
            company: company.trim(),
            location: location?.trim(),
            experienceText: experience?.trim(),
            salaryText: salary?.trim(),
            snippet: snippet?.trim(),
            url: jobUrl || url,
            externalId
          });
        } catch (cardError) {
          console.warn('[Naukri] Error parsing card', cardError);
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
