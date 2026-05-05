import type { BrowserContext } from 'playwright';
import type { BasePortalAdapter } from '../adapters/base';
import { resolveSourceId } from '../source-universe';
import type { ScrapeInput, ScrapeProvider, PortalType } from '../scraper-manager';

export class ExistingAdapterProvider implements ScrapeProvider {
  readonly id = 'existing-playwright-adapter';
  readonly label = 'Career Seek Playwright adapter';

  constructor(private readonly adapters?: Map<string, BasePortalAdapter>) {}

  supports(portal: PortalType): boolean {
    return Boolean(this.adapters?.has(resolveSourceId(portal)));
  }

  async isAvailable(): Promise<boolean> {
    return Boolean(this.adapters);
  }

  async scrape(input: ScrapeInput) {
    const adapter = this.adapters?.get(resolveSourceId(input.portal));
    if (!adapter) throw new Error('unsupported_provider: no existing adapter is configured for this portal.');
    if (!input.context) throw new Error('dependency_missing: browser context is unavailable for the existing adapter fallback.');
    const context = input.context as BrowserContext;
    return adapter.scrape(context, input.query, input.onProgress);
  }
}
