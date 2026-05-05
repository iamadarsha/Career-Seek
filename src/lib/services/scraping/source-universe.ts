import { type RoleFamilyId } from './role-family-packs';

export type IndiaJobSourceCategory =
  | 'broad_portal'
  | 'startup_tech_product'
  | 'freshers_internships'
  | 'blue_grey_collar'
  | 'government_public'
  | 'company_careers'
  | 'fallback';

export type SourceTrustLevel = 'official' | 'discovery' | 'portal' | 'vendor_fallback' | 'manual' | 'validation';

export interface SourceCapabilityFlags {
  trustLevel: SourceTrustLevel;
  publicAccess: 'structured_endpoint' | 'browser_page' | 'rss' | 'search_result_context' | 'manual';
  authGateRisk: 'low' | 'medium' | 'high';
  directUrlVerification: 'reliable' | 'browser_preferred' | 'often_403' | 'auth_gated' | 'not_applicable';
  fallbackSourceIds?: string[];
  liveProofStatus: 'verified_core' | 'partial' | 'fallback_only' | 'not_live_proven';
  liveProofGaps?: RoleFamilyId[];
  knownLimitations?: string[];
}

export interface IndiaJobSource {
  id: string;
  label: string;
  category: IndiaJobSourceCategory;
  priority: number;
  defaultEnabled: boolean;
  requiresBrowser: boolean;
  fallbackOnly?: boolean;
  sourceType: 'portal' | 'ats' | 'search_discovery' | 'vendor_fallback' | 'manual_recovery';
  aliases?: string[];
  capabilities?: SourceCapabilityFlags;
  notes: string;
}

export const INDIA_JOB_SOURCES: IndiaJobSource[] = [
  {
    id: 'company_ats',
    label: 'ATS-backed company career pages',
    category: 'company_careers',
    priority: 10,
    defaultEnabled: true,
    requiresBrowser: true,
    sourceType: 'ats',
    aliases: ['ats', 'company', 'careers', 'company_careers'],
    capabilities: {
      trustLevel: 'official',
      publicAccess: 'structured_endpoint',
      authGateRisk: 'medium',
      directUrlVerification: 'browser_preferred',
      fallbackSourceIds: ['official', 'google_jobs', 'manual_url'],
      liveProofStatus: 'partial',
      liveProofGaps: ['design', 'hr_recruiting'],
      knownLimitations: ['Structured endpoints are strongest for Greenhouse, Lever, Ashby, and selected public ATS pages; custom career pages remain best-effort.'],
    },
    notes: 'Curated India employer universe, including Greenhouse, Lever, Ashby, BambooHR, Rippling, Workday, iCIMS, SuccessFactors, and custom career pages.',
  },
  {
    id: 'official',
    label: 'Official company career pages',
    category: 'company_careers',
    priority: 15,
    defaultEnabled: true,
    requiresBrowser: true,
    sourceType: 'manual_recovery',
    aliases: ['official_companies', 'manual_url'],
    capabilities: {
      trustLevel: 'official',
      publicAccess: 'browser_page',
      authGateRisk: 'medium',
      directUrlVerification: 'browser_preferred',
      fallbackSourceIds: ['google_jobs', 'manual_url'],
      liveProofStatus: 'partial',
      liveProofGaps: ['design', 'hr_recruiting'],
      knownLimitations: ['Official custom pages may expose navigation pages instead of stable job posting URLs.'],
    },
    notes: 'Second company-owned pass for employer career pages outside structured ATS coverage; portals remain fallback sources.',
  },
  {
    id: 'google_jobs',
    label: 'Google for Jobs discovery',
    category: 'fallback',
    priority: 20,
    defaultEnabled: true,
    requiresBrowser: true,
    fallbackOnly: true,
    sourceType: 'search_discovery',
    aliases: ['google', 'google_for_jobs'],
    capabilities: {
      trustLevel: 'discovery',
      publicAccess: 'browser_page',
      authGateRisk: 'high',
      directUrlVerification: 'not_applicable',
      fallbackSourceIds: ['company_ats', 'official', 'manual_url'],
      liveProofStatus: 'fallback_only',
      knownLimitations: ['Live Google result pages can route to auth_gate or unusual-traffic pages; discovered URLs must be canonicalized before treating them as employer proof.'],
    },
    notes: 'Fallback-only discovery layer for public job and careers pages surfaced by Google search; live runs can hit auth_gate behavior.',
  },
  {
    id: 'jobspy',
    label: 'JobSpy-style multi-board fallback',
    category: 'fallback',
    priority: 30,
    defaultEnabled: true,
    requiresBrowser: true,
    sourceType: 'vendor_fallback',
    capabilities: {
      trustLevel: 'vendor_fallback',
      publicAccess: 'browser_page',
      authGateRisk: 'medium',
      directUrlVerification: 'browser_preferred',
      fallbackSourceIds: ['manual_url'],
      liveProofStatus: 'partial',
      knownLimitations: ['Recall fallback only; source attribution and duplicate handling need stronger review than employer-owned results.'],
    },
    notes: 'TypeScript fallback inspired by the vendored JobSpy project; direct Python execution is opt-in only.',
  },
  {
    id: 'linkedin',
    label: 'LinkedIn Jobs',
    category: 'broad_portal',
    priority: 40,
    defaultEnabled: true,
    requiresBrowser: true,
    sourceType: 'portal',
    aliases: ['linkedin_jobs'],
    capabilities: {
      trustLevel: 'portal',
      publicAccess: 'structured_endpoint',
      authGateRisk: 'high',
      directUrlVerification: 'auth_gated',
      fallbackSourceIds: ['company_ats', 'official', 'jobspy', 'manual_url'],
      liveProofStatus: 'partial',
      knownLimitations: ['Public guest jobs can auth-gate or rate-limit; browser search pages frequently redirect to LinkedIn authwall.'],
    },
    notes: 'Specific LinkedIn public guest fallback adapter.',
  },
  {
    id: 'naukri',
    label: 'Naukri',
    category: 'broad_portal',
    priority: 50,
    defaultEnabled: true,
    requiresBrowser: true,
    sourceType: 'portal',
    notes: 'India-first API/page hybrid adapter.',
  },
  {
    id: 'foundit',
    label: 'Foundit / Monster India',
    category: 'broad_portal',
    priority: 60,
    defaultEnabled: true,
    requiresBrowser: true,
    sourceType: 'portal',
    aliases: ['monster', 'monster_india'],
    notes: 'Foundit public page plus middleware fallback. Monster India aliases resolve here.',
  },
  {
    id: 'shine',
    label: 'Shine',
    category: 'broad_portal',
    priority: 70,
    defaultEnabled: true,
    requiresBrowser: true,
    sourceType: 'portal',
    notes: 'Configured public search-page adapter.',
  },
  {
    id: 'cutshort',
    label: 'Cutshort',
    category: 'startup_tech_product',
    priority: 80,
    defaultEnabled: true,
    requiresBrowser: true,
    sourceType: 'portal',
    notes: 'Startup and tech role source using configured public search-page extraction.',
  },
  {
    id: 'instahyre',
    label: 'Instahyre',
    category: 'startup_tech_product',
    priority: 90,
    defaultEnabled: true,
    requiresBrowser: true,
    sourceType: 'portal',
    capabilities: {
      trustLevel: 'portal',
      publicAccess: 'search_result_context',
      authGateRisk: 'high',
      directUrlVerification: 'often_403',
      fallbackSourceIds: ['cutshort', 'hirist', 'iimjobs', 'company_ats'],
      liveProofStatus: 'partial',
      knownLimitations: ['Cloudflare can return 403 for direct HTTP URL checks even when a browser-rendered search result was extracted.'],
    },
    notes: 'Specific Instahyre adapter with tolerant selector fallback.',
  },
  {
    id: 'hirist',
    label: 'Hirist',
    category: 'startup_tech_product',
    priority: 100,
    defaultEnabled: true,
    requiresBrowser: true,
    sourceType: 'portal',
    notes: 'Tech and product job board search-page adapter.',
  },
  {
    id: 'iimjobs',
    label: 'iimjobs',
    category: 'startup_tech_product',
    priority: 110,
    defaultEnabled: true,
    requiresBrowser: true,
    sourceType: 'portal',
    notes: 'Management, product, finance, and strategy jobs search-page adapter.',
  },
  {
    id: 'wellfound',
    label: 'Wellfound',
    category: 'startup_tech_product',
    priority: 120,
    defaultEnabled: true,
    requiresBrowser: true,
    sourceType: 'portal',
    notes: 'Startup portal kept as a later fallback because public pages frequently gate or drift.',
  },
  {
    id: 'indeed',
    label: 'Indeed India',
    category: 'broad_portal',
    priority: 130,
    defaultEnabled: true,
    requiresBrowser: true,
    sourceType: 'portal',
    capabilities: {
      trustLevel: 'portal',
      publicAccess: 'rss',
      authGateRisk: 'high',
      directUrlVerification: 'auth_gated',
      fallbackSourceIds: ['company_ats', 'official', 'jobspy', 'manual_url'],
      liveProofStatus: 'fallback_only',
      knownLimitations: ['Search pages are often blocked or gated; RSS is the preferred public fallback when available.'],
    },
    notes: 'Indeed India adapter with RSS fallback, placed later because of blocking risk.',
  },
  {
    id: 'timesjobs',
    label: 'TimesJobs',
    category: 'broad_portal',
    priority: 140,
    defaultEnabled: true,
    requiresBrowser: true,
    sourceType: 'portal',
    notes: 'Configured public search-page adapter.',
  },
  {
    id: 'glassdoor',
    label: 'Glassdoor',
    category: 'broad_portal',
    priority: 150,
    defaultEnabled: true,
    requiresBrowser: true,
    sourceType: 'portal',
    notes: 'Configured search-page adapter; expected to fail gracefully when gated.',
  },
  {
    id: 'placementindia',
    label: 'PlacementIndia',
    category: 'broad_portal',
    priority: 160,
    defaultEnabled: true,
    requiresBrowser: true,
    sourceType: 'portal',
    notes: 'Configured public search-page adapter.',
  },
  {
    id: 'hirect',
    label: 'Hirect',
    category: 'startup_tech_product',
    priority: 170,
    defaultEnabled: false,
    requiresBrowser: true,
    sourceType: 'portal',
    notes: 'Tracked for source universe coverage; disabled by default until public extraction proves stable.',
  },
  {
    id: 'internshala',
    label: 'Internshala',
    category: 'freshers_internships',
    priority: 180,
    defaultEnabled: false,
    requiresBrowser: true,
    sourceType: 'portal',
    notes: 'Freshers and internships source. Best enabled for fresher/intern role packs.',
  },
  {
    id: 'freshersworld',
    label: 'Freshersworld',
    category: 'freshers_internships',
    priority: 190,
    defaultEnabled: false,
    requiresBrowser: true,
    sourceType: 'portal',
    notes: 'Freshers source. Best enabled for fresher/intern role packs.',
  },
  {
    id: 'apna',
    label: 'Apna',
    category: 'blue_grey_collar',
    priority: 200,
    defaultEnabled: false,
    requiresBrowser: true,
    sourceType: 'portal',
    notes: 'Blue/grey collar source. Best enabled for sales, operations, delivery, and support roles.',
  },
  {
    id: 'workindia',
    label: 'WorkIndia',
    category: 'blue_grey_collar',
    priority: 210,
    defaultEnabled: false,
    requiresBrowser: true,
    sourceType: 'portal',
    notes: 'Blue/grey collar source. Best enabled for field and operations roles.',
  },
  {
    id: 'government',
    label: 'Government and public recruitment',
    category: 'government_public',
    priority: 220,
    defaultEnabled: false,
    requiresBrowser: true,
    sourceType: 'portal',
    aliases: ['sarkari', 'freejobalert', 'govt'],
    notes: 'Sarkari Result, FreeJobAlert, and official recruitment-page discovery. Best enabled for government role searches.',
  },
];

export const SOURCE_LADDER = INDIA_JOB_SOURCES
  .filter((source) => source.defaultEnabled)
  .sort((a, b) => a.priority - b.priority)
  .map((source) => source.id);

export const DEFAULT_DISCOVERY_SOURCE_IDS = SOURCE_LADDER;
export const MANDATORY_COMPANY_SOURCE_IDS = ['company_ats', 'official'];

const SOURCE_ALIAS_MAP = new Map<string, string>();
for (const source of INDIA_JOB_SOURCES) {
  SOURCE_ALIAS_MAP.set(source.id, source.id);
  for (const alias of source.aliases || []) {
    SOURCE_ALIAS_MAP.set(alias, source.id);
  }
}

export function resolveSourceId(sourceId: string) {
  return SOURCE_ALIAS_MAP.get(sourceId.toLowerCase().trim()) || sourceId.toLowerCase().trim();
}

export function orderSourcesByLadder(sourceIds: string[], availableIds?: Iterable<string>) {
  const available = availableIds ? new Set(Array.from(availableIds)) : null;
  const requested = sourceIds.map(resolveSourceId).filter(Boolean);
  const seen = new Set<string>();
  const ordered = [...requested].sort((a, b) => {
    const ap = INDIA_JOB_SOURCES.find((source) => source.id === a)?.priority ?? 999;
    const bp = INDIA_JOB_SOURCES.find((source) => source.id === b)?.priority ?? 999;
    return ap - bp;
  });

  return ordered.filter((sourceId) => {
    if (seen.has(sourceId)) return false;
    if (available && !available.has(sourceId)) return false;
    seen.add(sourceId);
    return true;
  });
}

export function withMandatoryCompanySources(sourceIds: string[]) {
  return Array.from(new Set([...MANDATORY_COMPANY_SOURCE_IDS, ...sourceIds.map(resolveSourceId)]));
}

export function sourceLabel(sourceId: string) {
  return INDIA_JOB_SOURCES.find((source) => source.id === resolveSourceId(sourceId))?.label || sourceId;
}

export function sourceCapabilities(sourceId: string) {
  return INDIA_JOB_SOURCES.find((source) => source.id === resolveSourceId(sourceId))?.capabilities;
}
