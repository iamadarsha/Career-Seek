import { chromium, Browser, BrowserContext } from 'playwright';

export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  async init(): Promise<BrowserContext> {
    if (this.context) {
      return this.context;
    }

    // Use stealthy configuration inspired by previous phase
    this.browser = await chromium.launch({
      channel: 'chrome', // Use real chrome to bypass bot detection like Cloudflare
      headless: true, // Configurable if we want to run in headed mode for debugging
      args: [
        '--no-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--window-size=1920,1080',
      ],
    });

    this.context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
      hasTouch: false,
      isMobile: false,
    });

    // Mask webdriver
    await this.context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
    });

    return this.context;
  }

  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
