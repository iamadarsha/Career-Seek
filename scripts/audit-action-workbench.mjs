import { chromium } from 'playwright';

const BASE_URL = process.env.AUDIT_BASE_URL || 'http://localhost:3002';
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

async function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function pageSummary(page) {
  return page.evaluate(() => {
    const visible = (el) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const controls = [...document.querySelectorAll('button,input,select,textarea,a[href]')];
    const unnamedControls = controls.filter((el) => {
      if (!visible(el)) return false;
      const text = (el.innerText || el.textContent || '').trim();
      const id = el.id;
      const labelledBy = el.getAttribute('aria-labelledby');
      const hasLabel = id && document.querySelector(`label[for="${CSS.escape(id)}"]`);
      return !text && !el.getAttribute('aria-label') && !el.getAttribute('title') && !labelledBy && !hasLabel && !el.closest('label') && !el.getAttribute('placeholder');
    });
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      unnamedControls: unnamedControls.map((el) => el.outerHTML.slice(0, 180)),
      bodyText: document.body.innerText.replace(/\s+/g, ' ').trim(),
    };
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const desktop = await browser.newPage({ viewport: DESKTOP });
    await desktop.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await desktop.waitForTimeout(2500);
    const firstJobTop = await desktop.locator('article').first().evaluate((el) => el.getBoundingClientRect().top).catch(() => null);
    await assert(firstJobTop !== null, 'Dashboard should render at least one ranked job card.');
    await assert(firstJobTop < 760, `Dashboard first job should appear above desktop fold; got top=${firstJobTop}.`);

    await desktop.goto(`${BASE_URL}/discover`, { waitUntil: 'domcontentloaded' });
    await desktop.waitForTimeout(2500);
    const discoverOrder = await desktop.evaluate(() => {
      const text = document.body.innerText;
      return {
        jobsIndex: Math.min(...['Ranked jobs', 'No matching jobs yet', 'Teacher', 'Engineer', 'Manager'].map((needle) => {
          const idx = text.indexOf(needle);
          return idx === -1 ? Number.POSITIVE_INFINITY : idx;
        })),
        sourceIndex: text.indexOf('Source health'),
      };
    });
    await assert(discoverOrder.sourceIndex === -1 || discoverOrder.jobsIndex < discoverOrder.sourceIndex, 'Discover should present jobs before detailed source health.');

    const routes = ['/', '/discover', '/pipeline', '/coach', '/settings/automation'];
    for (const route of routes) {
      const mobile = await browser.newPage({ viewport: MOBILE });
      await mobile.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded' });
      await mobile.waitForTimeout(2500);
      const summary = await pageSummary(mobile);
      await assert(summary.scrollWidth <= summary.clientWidth + 2, `${route} has horizontal overflow on mobile.`);
      await assert(summary.unnamedControls.length === 0, `${route} has unnamed controls: ${summary.unnamedControls.join(' | ')}`);
      if (route === '/coach') {
        await assert(summary.bodyText.includes('AI Coach'), 'Coach mobile should keep AI Coach content visible.');
        const coachPaneWidth = await mobile.locator('[data-testid="coach-chat-pane"]').evaluate((el) => el.getBoundingClientRect().width).catch(() => 0);
        await assert(coachPaneWidth >= 340, `Coach mobile chat pane is too narrow or missing: ${coachPaneWidth}px.`);
      }
      await mobile.close();
    }

    console.log('Action Workbench audit passed.');
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
