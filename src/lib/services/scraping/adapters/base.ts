import { JobQuery, PortalScanResult, RawScrapedJob } from '../types';
import { Page, BrowserContext } from 'playwright';

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
      console.error(`[${this.identifier}] Navigation failed:`, e);
      return false;
    }
  }

  // Common wrapper to format results
  protected formatResult(jobs: RawScrapedJob[], error?: string): PortalScanResult {
    return {
      portal: this.identifier,
      status: error ? (jobs.length > 0 ? 'partial' : 'failed') : 'success',
      jobs,
      error
    };
  }
}
