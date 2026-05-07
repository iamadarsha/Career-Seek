import { JobQuery } from './types';
import { normalizeRolePreferences } from '../search-preferences';
import { applySearchBroadening, expandLocations } from './search-broadener';

// Converts a unified search profile into a normalized JobQuery for the orchestrator
export function buildQueryFromProfile(profile: any): JobQuery {
  // Ensure we safely parse JSON arrays if they are stored as strings
  const parseJsonSafe = (val: any) => {
    if (!val) return [];
    if (typeof val === 'string') {
      try { return JSON.parse(val); } catch (e) { return []; }
    }
    return Array.isArray(val) ? val : [];
  };

  const normalizedRoles = normalizeRolePreferences({ title: profile.title });
  const titleVariants = normalizedRoles.titleVariants;

  // Process experience band
  let experienceMin: number | undefined;
  let experienceMax: number | undefined;
  if (profile.experienceBand) {
    const match = profile.experienceBand.match(/(\d+)(?:\s*-\s*(\d+))?/);
    if (match) {
      experienceMin = parseInt(match[1], 10);
      if (match[2]) {
        experienceMax = parseInt(match[2], 10);
      }
    }
  }

  // Process expected salary
  // We store the raw target then let search-broadener expand it to a ±20% range.
  let salaryMin: number | undefined;
  if (profile.expectedSalary) {
    const lowerSalary = String(profile.expectedSalary).toLowerCase();
    const match = lowerSalary.match(/(\d+(?:\.\d+)?)/);
    if (match) {
      const value = Number(match[1]);
      salaryMin = /lpa|lac|lakh|lakhs/.test(lowerSalary)
        ? Math.round(value * 100_000)
        : Math.round(value);
    }
  }

  const rawLocations = parseJsonSafe(profile.locations);
  const rawCompanyTypes = parseJsonSafe(profile.companyTypes)
    .map((item: string) => String(item || '').trim())
    .filter(Boolean);
  const targetCompanies = rawCompanyTypes
    .filter((item: string) => item.toLowerCase().startsWith('target_company:'))
    .map((item: string) => item.replace(/^target_company:/i, '').trim())
    .filter(Boolean);
  const companyTypes = rawCompanyTypes
    .filter((item: string) => !item.toLowerCase().startsWith('target_company:'));

  const rawNormalizedLocations = rawLocations
    .map((location: string) => String(location || '').trim())
    .filter(Boolean)
    .map((location: string) => /^(anywhere\s+in\s+)?india$|^anywhere$|^any location$|^all india$/i.test(location)
      ? 'India'
      : location);

  const baseLocations: string[] = rawNormalizedLocations.length
    ? Array.from(new Set(rawNormalizedLocations))
    : ['India'];

  const isRemote = profile.workModel?.toLowerCase().includes('remote') ?? false;
  const isHybrid = profile.workModel?.toLowerCase().includes('hybrid') ?? false;

  // Build the base query
  const baseQuery: JobQuery = {
    titleVariants,
    locations: baseLocations,
    targetCompanies,
    companyTypes,
    isRemote,
    isHybrid,
    experienceMin,
    experienceMax,
    salaryMin,
    keywords: parseJsonSafe(profile.mustHaveKeywords),
    avoidKeywords: parseJsonSafe(profile.avoidKeywords),
  };

  // Apply search broadening:
  // - Salary target → ±20% range (12–18 LPA when user says 15 LPA)
  // - Location aliases (Bangalore → also Bengaluru, etc.)
  // - Remote added to location list when work model includes remote/hybrid
  // - Experience band widened by 1 year each side
  return applySearchBroadening(baseQuery, {
    allowRemote: isRemote || isHybrid,
    widenExperience: true,
    maxLocations: 8,
  });
}

// Applies expansion rules when a scan yields too few results
export function expandQuery(query: JobQuery, level: number): JobQuery {
  const expanded = { ...query };
  // Clone arrays to avoid mutating the original
  expanded.titleVariants = [...query.titleVariants];
  expanded.locations = [...query.locations];

  switch (level) {
    case 1:
      // Level 1: add Remote to location list and mark isRemote
      if (!expanded.isRemote) {
        expanded.isRemote = true;
        expanded.locations = expandLocations(expanded.locations, { addRemote: true, maxLocations: 10 });
      }
      break;
    case 2:
      // Level 2: widen experience band further
      if (expanded.experienceMin != null && expanded.experienceMin > 0) {
        expanded.experienceMin = Math.max(0, expanded.experienceMin - 1);
      }
      if (expanded.experienceMax != null) {
        expanded.experienceMax = expanded.experienceMax + 2;
      }
      break;
    case 3:
      // Level 3: widen salary range by another 20% on each side
      if (expanded.salaryMin != null && expanded.salaryMin > 0) {
        expanded.salaryMin = Math.max(0, Math.round(expanded.salaryMin * 0.8));
      }
      if (expanded.salaryMax != null && expanded.salaryMax > 0) {
        expanded.salaryMax = Math.round(expanded.salaryMax * 1.2);
      }
      break;
    case 4:
      // Level 4: drop avoid keywords so more results come through
      expanded.avoidKeywords = [];
      break;
    case 5:
      // Level 5: add "India" as catch-all location for any remaining portals
      if (!expanded.locations.includes('India')) {
        expanded.locations = [...expanded.locations, 'India'];
      }
      // Also remove salary floor/ceiling to maximise results
      expanded.salaryMin = undefined;
      expanded.salaryMax = undefined;
      break;
  }
  return expanded;
}
