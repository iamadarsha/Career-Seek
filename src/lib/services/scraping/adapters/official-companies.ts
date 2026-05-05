import { BrowserContext } from 'playwright';
import { BasePortalAdapter } from './base';
import { JobQuery, PortalScanResult, RawScrapedJob } from '../types';
import { companySourcesForRoleFamilies } from '../company-careers-map';
import { inferRoleFamilies } from '../role-family-packs';
import { waitForCompanyCareerDomainSlot } from '../rate-limiter';

const HEALTH_CHECK_PAGE = { company: 'Razorpay', url: 'https://razorpay.com/jobs/' };
const EXTRA_OFFICIAL_CAREER_PAGES = [
  HEALTH_CHECK_PAGE,
  { company: 'Zerodha', url: 'https://zerodha.com/careers/' },
];
const DEFAULT_OFFICIAL_SOURCE_LIMIT = 60;
const DEFAULT_OFFICIAL_JOBS_PER_COMPANY = 5;
const DEFAULT_OFFICIAL_JOB_CAP = 30;

const GENERIC_OFFICIAL_TITLE_PATTERNS = [
  /^careers?$/i,
  /^my career$/i,
  /^search results?$/i,
  /^join our talent community$/i,
  /^learning and development$/i,
  /^business sector$/i,
  /^how we hire$/i,
  /^person_outline/i,
];

function cleanOfficialTitle(value: string) {
  const cleaned = String(value || '').replace(/\s+/g, ' ').trim();
  if (!cleaned || cleaned.length > 110 || /<[^>]+>|src=|data-nimg|logo\.svg/i.test(cleaned)) {
    return null;
  }
  if (GENERIC_OFFICIAL_TITLE_PATTERNS.some((pattern) => pattern.test(cleaned))) return null;
  return cleaned;
}

function cappedPositiveInt(raw: string | undefined, fallback: number, max: number) {
  const parsed = Number(raw || fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function officialSourceLimit() {
  return cappedPositiveInt(process.env.JOBHUNT_OFFICIAL_SOURCE_LIMIT, DEFAULT_OFFICIAL_SOURCE_LIMIT, 120);
}

function officialJobsPerCompany() {
  return cappedPositiveInt(process.env.JOBHUNT_OFFICIAL_JOBS_PER_COMPANY, DEFAULT_OFFICIAL_JOBS_PER_COMPANY, 12);
}

function officialJobCap() {
  return cappedPositiveInt(process.env.JOBHUNT_OFFICIAL_JOB_CAP, DEFAULT_OFFICIAL_JOB_CAP, 80);
}

function decodeHtml(value: string) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function flattenJson(value: any): any[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(flattenJson);
  if (typeof value === 'object') {
    return [
      value,
      ...flattenJson(value['@graph']),
      ...flattenJson(value.itemListElement),
    ];
  }
  return [];
}

function jsonLdJobsFromHtml(html: string, company: string) {
  const scripts = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  const jobs: Array<{ text: string; href: string }> = [];
  const seen = new Set<string>();

  for (const script of scripts) {
    const body = script.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '').trim();
    try {
      const parsed = JSON.parse(decodeHtml(body));
      const nodes = flattenJson(parsed);
      for (const node of nodes) {
        const type = Array.isArray(node?.['@type']) ? node['@type'].join(' ') : node?.['@type'];
        if (!/jobposting/i.test(String(type || ''))) continue;
        const href = String(node.url || node.sameAs || '').trim();
        const text = cleanOfficialTitle(String(node.title || node.name || ''));
        if (!href || !text || seen.has(href)) continue;
        seen.add(href);
        jobs.push({ text, href });
      }
    } catch {
      // Invalid JSON-LD should not break official-source extraction.
    }
  }

  return jobs.map((job) => ({
    ...job,
    text: cleanOfficialTitle(job.text) || company,
  }));
}

function officialRoleMatch(text: string, href: string, roleTerms: string[], query: JobQuery) {
  const loweredText = text.toLowerCase();
  const loweredHref = href.toLowerCase();
  const hasRoleText = roleTerms.some((term) => loweredText.includes(term));
  const hasRoleHref = roleTerms.some((term) => loweredHref.includes(term.replace(/\s+/g, '-')) || loweredHref.includes(term));
  const combined = `${loweredText} ${loweredHref}`;

  const productIntent = query.titleVariants.some((variant) => /product manager|ai product|genai product|llm product|product owner|program manager|\bapm\b/i.test(variant));
  if (productIntent) {
    const looksSalesy = /\b(account executive|account manager|sales|alliance|alliances|business development|demand generation|partner|customer success|revenue)\b/.test(combined);
    return /\b(product|program)\b/.test(combined) && !looksSalesy;
  }

  const designIntent = query.titleVariants.some((variant) => /\bux\b|\bui\b|designer|product design|interaction design|research/i.test(variant));
  if (designIntent) {
    return /\b(designer|design|ux|ui|researcher|research|interaction)\b/.test(combined);
  }

  const complianceIntent = query.titleVariants.some((variant) => /compliance|aml|kyc|financial crime|sanctions|transaction monitoring|regulatory/i.test(variant));
  if (complianceIntent) {
    return /\b(compliance|aml|kyc|financial crime|sanction|regulatory|risk|transaction monitoring|cdd|edd|fraud|due diligence|screening|alert review|investigation|officer|analyst)\b/.test(combined);
  }

  const backendIntent = query.titleVariants.some((variant) => /backend|java|spring/i.test(variant));
  if (backendIntent) {
    return /\b(backend|java|spring|api|platform)\b/.test(combined) && /\b(engineer|developer|architect|programmer)\b/.test(combined);
  }

  return hasRoleText || hasRoleHref;
}

export class OfficialCompaniesAdapter extends BasePortalAdapter {
  identifier = 'official';
  displayName = 'Official career pages';

  async healthCheck(context: BrowserContext): Promise<boolean> {
    const page = await context.newPage();
    const isUp = await this.safeNavigate(page, HEALTH_CHECK_PAGE.url);
    await page.close();
    return isUp;
  }

  async scrape(context: BrowserContext, query: JobQuery, onProgress?: (msg: string) => void): Promise<PortalScanResult> {
    const jobs: RawScrapedJob[] = [];
    const roleTerms = [
      ...query.titleVariants,
      ...(query.keywords || []),
    ]
      .flatMap((role) => role.toLowerCase().split(/[^a-z0-9+#.]+/))
      .filter((term) => term.length > 2);

    try {
      const roleFamilies = inferRoleFamilies([...query.titleVariants, ...(query.keywords || [])]);
      const seenUrls = new Set<string>();
      const officialPages = [
        ...companySourcesForRoleFamilies(roleFamilies, officialSourceLimit(), {
          targetCompanies: query.targetCompanies,
          locations: query.locations,
          companyTypes: query.companyTypes,
        })
          .map((source) => ({ company: source.company, url: source.careersUrl })),
        ...EXTRA_OFFICIAL_CAREER_PAGES,
      ].filter((pageInfo) => {
        if (seenUrls.has(pageInfo.url)) return false;
        seenUrls.add(pageInfo.url);
        return true;
      });

      for (const pageInfo of officialPages) {
        if (jobs.length >= officialJobCap()) break;
        let page: any = null;
        try {
          onProgress?.(`Checking official careers: ${pageInfo.company}`);
          await waitForCompanyCareerDomainSlot(pageInfo.url);
          page = await context.newPage();
          const ok = await this.safeNavigate(page, pageInfo.url, 20000);
          if (!ok) continue;
          await this.randomDelay(150, 320);
          const bodyText = (await page.locator('body').innerText({ timeout: 4500 })).slice(0, 12000);
          const lower = bodyText.toLowerCase();
          const hasIndiaSignal = !query.locations?.length || query.locations.some((location) => lower.includes(location.toLowerCase())) || lower.includes('india');

          if (hasIndiaSignal || /remote|anywhere|hybrid|india/i.test(bodyText)) {
            const html = await page.content().catch(() => '');
            const links: Array<{ text: string; href: string }> = await page.$$eval('a', (anchors: Element[]) => anchors.map((anchor: Element) => ({
              text: (anchor.textContent || '').trim(),
              href: (anchor as HTMLAnchorElement).href,
            }))).catch(() => []);
            const jsonLdJobs = html ? jsonLdJobsFromHtml(html, pageInfo.company) : [];

            const matchingLinks = [...jsonLdJobs, ...links]
              .filter((link) => link.href && link.text.length > 4)
              .filter((link) => {
                const text = link.text.toLowerCase();
                const href = link.href.toLowerCase();
                const looksLikeCareerLink = /career|job|opening|position|requisition|greenhouse|lever|workday|myworkdayjobs|ashby|rippling|bamboohr|icims|successfactors|sapsf|jobreqcareer|boards|jobs\.|applications|jobdetails|open-positions/.test(href);
                const looksLikeNonJob = /complaint|privacy|terms|support|help|blog|investor|press|login|signup|contact/.test(`${text} ${href}`);
                const looksExplicitlyOutsideIndia = /\b(united states|usa|canada|germany|poland|ireland|australia|new zealand|netherlands|spain|france|london|uk)\b/.test(`${text} ${href}`);
                const genericText = GENERIC_OFFICIAL_TITLE_PATTERNS.some((pattern) => pattern.test(link.text.trim()));
                return looksLikeCareerLink && officialRoleMatch(link.text, link.href, roleTerms, query) && !looksLikeNonJob && !looksExplicitlyOutsideIndia && !genericText;
              })
              .filter((link, index, items) => items.findIndex((candidate) => candidate.href === link.href) === index)
              .slice(0, officialJobsPerCompany());

            for (const link of matchingLinks) {
              const cleanedTitle = cleanOfficialTitle(link.text);
              if (!cleanedTitle) continue;
              jobs.push({
                portal: this.identifier,
                title: cleanedTitle,
                company: pageInfo.company,
                location: query.locations?.join(', ') || 'India',
                snippet: `Official Career Page - ${pageInfo.company}. Employer-owned career listing found from the company's careers page. Verify details on the employer site before applying.`,
                url: link.href,
                applyUrl: link.href,
                employmentType: `Official Career Page - ${pageInfo.company}`,
              });
              if (jobs.length >= officialJobCap()) break;
            }
          }
        } catch {
          // A single official site should never block the rest of the scan.
        } finally {
          if (page) {
            await page.close().catch(() => undefined);
          }
        }
      }

      if (jobs.length === 0) {
        throw new Error('empty_results: official career pages did not expose matching public job links');
      }
      return this.formatResult(jobs);
    } catch (error: any) {
      return this.formatFailureResult(jobs, error);
    }
  }
}
