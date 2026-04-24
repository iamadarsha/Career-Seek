import { JobQuery } from './types';

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

  const titleVariants = [profile.title];
  // Add some simple logic to expand titles based on keywords if needed, 
  // but for now, rely on exact title match plus variants if explicitly given

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
  let salaryMin: number | undefined;
  if (profile.expectedSalary) {
    const match = profile.expectedSalary.match(/(\d+)/);
    if (match) {
      salaryMin = parseInt(match[1], 10);
      // assuming the number extracted is e.g. 25 for "25 LPA"
      // or 2500000. Let adapters handle interpretation.
    }
  }

  return {
    titleVariants,
    locations: parseJsonSafe(profile.locations),
    isRemote: profile.workModel?.toLowerCase().includes('remote'),
    isHybrid: profile.workModel?.toLowerCase().includes('hybrid'),
    experienceMin,
    experienceMax,
    salaryMin,
    keywords: parseJsonSafe(profile.mustHaveKeywords),
    avoidKeywords: parseJsonSafe(profile.avoidKeywords),
  };
}

// Applies expansion rules when a scan yields too few results
export function expandQuery(query: JobQuery, level: number): JobQuery {
  const expanded = { ...query };
  // Clone arrays to avoid mutating the original
  expanded.titleVariants = [...query.titleVariants];
  expanded.locations = [...query.locations];

  switch (level) {
    case 1:
      // Level 1: broaden location radius or region, or include remote
      if (!expanded.isRemote) expanded.isRemote = true;
      break;
    case 2:
      // Level 2: widen experience band
      if (expanded.experienceMin && expanded.experienceMin > 0) expanded.experienceMin -= 1;
      if (expanded.experienceMax) expanded.experienceMax += 2;
      break;
    case 3:
      // Level 3: relax salary floor
      if (expanded.salaryMin && expanded.salaryMin > 0) expanded.salaryMin = Math.max(0, expanded.salaryMin * 0.8);
      break;
    case 4:
      // Level 4: drop some avoid keywords
      expanded.avoidKeywords = [];
      break;
  }
  return expanded;
}
