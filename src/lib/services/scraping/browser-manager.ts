import { chromium, Browser, BrowserContext } from 'playwright';
import { getSystemCapabilities } from '@/lib/services/system/capabilities';

export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  async init(): Promise<BrowserContext> {
    if (this.context) {
      return this.context;
    }

    const launchOptions = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--window-size=1920,1080',
      ],
    };

    const capabilities = getSystemCapabilities();
    if (process.env.JOBHUNT_BROWSER_SAFE_MODE === '1' || (capabilities.source === 'doctor' && !capabilities.has_browser)) {
      throw new Error(
        'browser_error: Browser safe mode is enabled because Playwright/Chrome dependencies are unavailable. Run `npm run bootstrap` or `npx playwright install chromium` to enable live portal scans.',
      );
    }

    try {
      // Prefer installed Chrome when available, but fall back to Playwright Chromium.
      this.browser = await chromium.launch({
        ...launchOptions,
        channel: 'chrome',
      });
    } catch (error) {
      console.warn('[BrowserManager] Chrome channel unavailable; falling back to bundled Chromium.');
      try {
        this.browser = await chromium.launch(launchOptions);
      } catch (fallbackError) {
        throw new Error(
          `browser_error: Playwright browser launch failed. Run \`npm run doctor\` and \`npx playwright install chromium\`. Details: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
        );
      }
    }

    this.context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
      hasTouch: false,
      isMobile: false,
    });

    // Stealth patches — mask headless/automation signals
    await this.context.addInitScript(() => {
      // 1. webdriver flag
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

      // 2. navigator.languages
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });

      // 3. navigator.plugins — non-empty to look like real Chrome
      Object.defineProperty(navigator, 'plugins', {
        get: () => {
          const plugins = [
            { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format', length: 1 },
            { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '', length: 1 },
            { name: 'Native Client', filename: 'internal-nacl-plugin', description: '', length: 2 },
          ];
          return Object.assign(plugins, { item: (i: number) => plugins[i] ?? null, namedItem: (n: string) => plugins.find((p) => p.name === n) ?? null });
        },
      });

      // 4. window.chrome — expected by many bot checks on Chrome
      (window as any).chrome = {
        app: {
          isInstalled: false,
          InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
          RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
        },
        runtime: {
          PlatformOs: { MAC: 'mac', WIN: 'win', ANDROID: 'android', CROS: 'cros', LINUX: 'linux', OPENBSD: 'openbsd' },
          PlatformArch: { ARM: 'arm', X86_32: 'x86-32', X86_64: 'x86-64' },
          RequestUpdateCheckStatus: { THROTTLED: 'throttled', NO_UPDATE: 'no_update', UPDATE_AVAILABLE: 'update_available' },
          connect: () => { },
          sendMessage: () => { },
        },
        csi: () => { },
        loadTimes: () => ({
          requestTime: Date.now() / 1000,
          startLoadTime: Date.now() / 1000,
          commitLoadTime: Date.now() / 1000,
          finishDocumentLoadTime: Date.now() / 1000,
          finishLoadTime: Date.now() / 1000,
          firstPaintTime: 0,
          firstPaintAfterLoadTime: 0,
          navigationType: 'Other',
          wasFetchedViaSpdy: false,
          wasNpnNegotiated: false,
          npnNegotiatedProtocol: 'unknown',
          wasAlternateProtocolAvailable: false,
          connectionInfo: 'unknown',
        }),
      };

      // 5. Permissions query — prevent detection via Notification.permission probe
      const origQuery = window.navigator.permissions.query.bind(window.navigator.permissions);
      window.navigator.permissions.query = (parameters: any) =>
        parameters.name === 'notifications'
          ? Promise.resolve({ state: (window.Notification as any).permission ?? 'default', onchange: null } as PermissionStatus)
          : origQuery(parameters);

      // 6. WebGL — mask Swiftshader (headless renderer) with realistic Mac GPU strings
      const origGetParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function (parameter: number) {
        if (parameter === 37445) return 'Intel Inc.';          // UNMASKED_VENDOR_WEBGL
        if (parameter === 37446) return 'Intel Iris OpenGL Engine'; // UNMASKED_RENDERER_WEBGL
        return origGetParameter.call(this, parameter);
      };

      // 7. Consistent screen dimensions
      Object.defineProperty(screen, 'availWidth', { get: () => 1920 });
      Object.defineProperty(screen, 'availHeight', { get: () => 1080 });
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
