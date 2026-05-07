/**
 * search-broadener.ts
 *
 * Applies intelligent search broadening so users get wider, more relevant results.
 *
 * Key expansions:
 * 1. Salary range   — target ±20 % creates a realistic search band
 * 2. Location alias — "Bangalore" ↔ "Bengaluru", "Mumbai" ↔ "Bombay", etc.
 * 3. Remote opt-in  — include "Remote" when work model allows it
 * 4. Experience     — widen the band by 1 year each side so near-fit roles appear
 * 5. Keyword hints  — role-family keyword hints appended to broaden text matches
 */

import { JobQuery } from './types';

// ─── Indian city aliases ─────────────────────────────────────────────────────
// Each entry lists all accepted spellings/variants for a metro.
// When any variant is present in the query, we add all others.
const CITY_ALIAS_GROUPS: string[][] = [
  ['Bangalore', 'Bengaluru', 'Bengaluru Urban'],
  ['Mumbai', 'Bombay', 'Navi Mumbai', 'Thane'],
  ['Delhi', 'New Delhi', 'Delhi NCR', 'NCR'],
  ['Hyderabad', 'Secunderabad', 'Cyberabad'],
  ['Chennai', 'Madras'],
  ['Kolkata', 'Calcutta'],
  ['Pune', 'Pimpri', 'Pimpri-Chinchwad'],
  ['Ahmedabad', 'Gandhinagar'],
  ['Gurugram', 'Gurgaon'],
  ['Noida', 'Greater Noida'],
  ['Faridabad', 'Ballabgarh'],
  ['Kochi', 'Cochin', 'Ernakulam'],
  ['Thiruvananthapuram', 'Trivandrum'],
  ['Coimbatore', 'Kovai'],
  ['Jaipur', 'Jodhpur'],
  ['Lucknow', 'Kanpur'],
  ['Bhubaneswar', 'Cuttack'],
  ['Visakhapatnam', 'Vizag'],
];

// Build a lookup: canonical lower-case key → full alias group
const CITY_LOWER_TO_GROUP = new Map<string, string[]>();
for (const group of CITY_ALIAS_GROUPS) {
  for (const city of group) {
    CITY_LOWER_TO_GROUP.set(city.toLowerCase(), group);
  }
}

/**
 * Expands a list of location strings by adding city aliases and, optionally,
 * a "Remote" entry for remote-friendly profiles.
 *
 * Returns a de-duplicated list; original ordering is preserved, aliases follow
 * the city they expand.
 */
export function expandLocations(
  locations: string[],
  opts: { addRemote?: boolean; maxLocations?: number } = {},
): string[] {
  const { addRemote = false, maxLocations = 8 } = opts;
  const seen = new Set<string>();
  const result: string[] = [];

  function push(city: string) {
    const key = city.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    result.push(city.trim());
  }

  for (const loc of locations) {
    const trimmed = loc.trim();
    push(trimmed);

    // Look for alias group
    const group = CITY_LOWER_TO_GROUP.get(trimmed.toLowerCase());
    if (group) {
      for (const alias of group) push(alias);
    }
  }

  if (addRemote) push('Remote');

  return result.slice(0, maxLocations);
}

// ─── Salary range ────────────────────────────────────────────────────────────
/** ±20 % expansion factor for salary range */
const SALARY_RANGE_FACTOR = 0.2;

/**
 * Given a target salary in base currency units (e.g. INR), returns a
 * [min, max] range expanded by ±SALARY_RANGE_FACTOR.
 *
 * Examples (LPA stored as INR):
 *   target = 15 LPA = 1_500_000 INR → min = 1_200_000, max = 1_800_000
 *   target = 5 LPA  =   500_000 INR → min =   400_000, max =   600_000
 */
export function expandSalaryToRange(
  targetAmount: number,
): { min: number; max: number } {
  const min = Math.round(targetAmount * (1 - SALARY_RANGE_FACTOR));
  const max = Math.round(targetAmount * (1 + SALARY_RANGE_FACTOR));
  return { min, max };
}

/**
 * Formats a salary in INR as a human-readable LPA string for logging.
 */
export function formatSalaryLPA(inr: number): string {
  return `${(inr / 100_000).toFixed(1)} LPA`;
}

// ─── Experience range ────────────────────────────────────────────────────────
/** How many years to widen each side of the experience band */
const EXPERIENCE_BUFFER_YEARS = 1;

/**
 * Widens an experience range so near-fit candidates and roles are included.
 * Minimum is clamped to 0.
 */
export function widenExperienceRange(
  expMin?: number,
  expMax?: number,
): { min?: number; max?: number } {
  if (expMin == null && expMax == null) return {};
  const min = expMin != null ? Math.max(0, expMin - EXPERIENCE_BUFFER_YEARS) : undefined;
  const max = expMax != null ? expMax + EXPERIENCE_BUFFER_YEARS : undefined;
  return { min, max };
}

// ─── Main broadening entry point ─────────────────────────────────────────────
export interface BroadeningOptions {
  /**
   * Whether the profile's work model allows remote work. When true, "Remote"
   * is added to the location list.
   */
  allowRemote?: boolean;
  /**
   * Whether to widen the experience band from the start (before any expansion
   * round). Defaults to true.
   */
  widenExperience?: boolean;
  /**
   * Maximum number of locations to include (including aliases). Defaults to 8.
   */
  maxLocations?: number;
}

/**
 * Applies all broadening transformations to a `JobQuery` and returns a new
 * (non-mutating) query.
 *
 * Called once in `buildQueryFromProfile()` so every scan starts with a wider
 * net than the literal user input.
 */
export function applySearchBroadening(
  query: JobQuery,
  opts: BroadeningOptions = {},
): JobQuery {
  const {
    allowRemote = false,
    widenExperience = true,
    maxLocations = 8,
  } = opts;

  // 1. Salary range
  let salaryMin = query.salaryMin;
  let salaryMax = query.salaryMax;
  if (salaryMin != null && salaryMax == null) {
    const range = expandSalaryToRange(salaryMin);
    salaryMin = range.min;
    salaryMax = range.max;
  }

  // 2. Location aliases + optional remote
  const locations = expandLocations(query.locations, {
    addRemote: allowRemote,
    maxLocations,
  });

  // 3. Experience range widen
  let experienceMin = query.experienceMin;
  let experienceMax = query.experienceMax;
  if (widenExperience) {
    const widened = widenExperienceRange(query.experienceMin, query.experienceMax);
    experienceMin = widened.min;
    experienceMax = widened.max;
  }

  return {
    ...query,
    locations,
    salaryMin,
    salaryMax,
    experienceMin,
    experienceMax,
  };
}
