import { getDb } from '../../../db';
import { masterProfiles, searchProfiles, normalizedJobs, scoredJobs } from '../../../db/schema';
import { eq, inArray, and } from 'drizzle-orm';
import { resolveContext } from '@/lib/platform/identity';

export interface ScoreBreakdown {
  titleScore: number;
  skillScore: number;
  locationScore: number;
  experienceScore: number;
  workModeScore: number;
  keywordScore: number;
  totalScore: number;
  positiveFactors: string[];
  negativeFactors: string[];
  warnings: string[];
}

import { SCORING_THRESHOLDS } from '../../constants/scoring';

export function determineTier(score: number): string {
  if (score >= SCORING_THRESHOLDS.TIER_A) return 'A';
  if (score >= SCORING_THRESHOLDS.TIER_B) return 'B';
  if (score >= SCORING_THRESHOLDS.TIER_C) return 'C';
  return 'D';
}

function safeParseJSON(jsonStr: string | null | undefined, fallback: any[] = []) {
  if (!jsonStr) return fallback;
  try {
    return JSON.parse(jsonStr);
  } catch {
    return fallback;
  }
}

export function scoreJob(job: any, master: any, search: any): ScoreBreakdown {
  let totalScore = 0;
  const positiveFactors: string[] = [];
  const negativeFactors: string[] = [];
  const warnings: string[] = [];

  // 1. Title Relevance (Max 20)
  let titleScore = 0;
  const searchTitle = search.title?.toLowerCase() || '';
  const jobTitle = job.title?.toLowerCase() || '';
  if (searchTitle && jobTitle.includes(searchTitle)) {
    titleScore = 20;
    positiveFactors.push("Exact title match");
  } else if (searchTitle && searchTitle.split(' ').some((word: string) => jobTitle.includes(word))) {
    titleScore = 10;
    positiveFactors.push("Partial title match");
  } else {
    negativeFactors.push("Title does not match search intent closely");
  }
  totalScore += titleScore;

  // 2. Skill Overlap (Max 30)
  let skillScore = 0;
  const explicitSkills = safeParseJSON(master.skillsExplicit);
  const inferredSkills = safeParseJSON(master.skillsInferred);
  const allSkills = [...explicitSkills, ...inferredSkills].map(s => s.toLowerCase());
  const jobSnippet = (job.snippet || '').toLowerCase();
  
  let matchCount = 0;
  allSkills.forEach(skill => {
    if (skill && jobSnippet.includes(skill)) matchCount++;
  });

  if (matchCount >= 5) {
    skillScore = 30;
    positiveFactors.push("Strong skill overlap");
  } else if (matchCount >= 2) {
    skillScore = 15;
    positiveFactors.push("Moderate skill overlap");
  } else {
    negativeFactors.push("Few matching skills detected in description");
    warnings.push("Job description might be too short or generic for accurate skill matching");
  }
  totalScore += skillScore;

  // 3. Experience Fit (Max 20)
  let experienceScore = 0;
  const userExp = master.yearsOfExperience || 0;
  const jobExpMin = job.experienceMin;
  const jobExpMax = job.experienceMax;

  if (jobExpMin != null && jobExpMax != null) {
    if (userExp >= jobExpMin && userExp <= jobExpMax) {
      experienceScore = 20;
      positiveFactors.push("Experience level is a perfect fit");
    } else if (userExp > jobExpMax) {
      experienceScore = 10; // Overqualified, but maybe fine
      warnings.push("Potentially overqualified for this role");
    } else if (userExp < jobExpMin && userExp >= jobExpMin - 1) {
      experienceScore = 10; // Slightly underqualified
      negativeFactors.push("Slightly under expected experience level");
    } else {
      negativeFactors.push("Significant experience mismatch");
    }
  } else {
    // Missing data
    experienceScore = 10; // Neutral fallback
    warnings.push("No explicit experience requirements found in job post");
  }
  totalScore += experienceScore;

  // 4. Work Mode Fit (Max 15)
  let workModeScore = 0;
  const prefMode = search.workModel?.toLowerCase();
  
  if (prefMode === 'remote' && job.isRemote) {
    workModeScore = 15;
    positiveFactors.push("Matches remote preference");
  } else if (prefMode === 'hybrid' && job.isHybrid) {
    workModeScore = 15;
    positiveFactors.push("Matches hybrid preference");
  } else if (prefMode === 'onsite' && !job.isRemote && !job.isHybrid) {
    workModeScore = 15;
    positiveFactors.push("Matches onsite preference");
  } else if (!prefMode) {
    workModeScore = 15; // No preference
  } else {
    // Partial mismatch
    workModeScore = 5;
    negativeFactors.push(`Does not perfectly match ${prefMode} preference`);
  }
  totalScore += workModeScore;

  // 5. Keyword Include/Exclude (Max 15, can be negative)
  let keywordScore = 0;
  const mustHaves = safeParseJSON(search.mustHaveKeywords);
  const avoids = safeParseJSON(search.avoidKeywords);

  let hasMustHaves = true;
  mustHaves.forEach((kw: string) => {
    if (!jobSnippet.includes(kw.toLowerCase())) hasMustHaves = false;
  });

  if (mustHaves.length > 0 && hasMustHaves) {
    keywordScore += 15;
    positiveFactors.push("Contains all must-have keywords");
  } else if (mustHaves.length > 0) {
    negativeFactors.push("Missing some must-have keywords");
  } else {
    keywordScore += 15; // default if none specified
  }

  let hasAvoid = false;
  avoids.forEach((kw: string) => {
    if (jobSnippet.includes(kw.toLowerCase())) hasAvoid = true;
  });

  if (hasAvoid) {
    keywordScore -= 20; // Heavy penalty
    negativeFactors.push("Contains avoid keywords");
  }
  
  totalScore += keywordScore;

  // Bound score 0-100
  totalScore = Math.max(0, Math.min(100, totalScore));

  return {
    titleScore,
    skillScore,
    locationScore: 0, // simplified for now
    experienceScore,
    workModeScore,
    keywordScore,
    totalScore,
    positiveFactors,
    negativeFactors,
    warnings,
  };
}

export async function scoreUnscoredJobs(profileId: number, onProgress?: (progress: number) => void) {
  const db = getDb();
  
  // Find active profiles for this specific user profile
  const searchProfile = db.select().from(searchProfiles)
    .where(and(eq(searchProfiles.isActive, true), eq(searchProfiles.profileId, profileId)))
    .get();
  if (!searchProfile) return 0;
  
  // Grab the latest master profile for this specific user profile
  const masterProfile = db.select().from(masterProfiles)
    .where(eq(masterProfiles.profileId, profileId))
    .get();
  if (!masterProfile) return 0;
 
  // Find all normalized jobs for this profile that don't have a scoredJob entry
  const allScored = db.select({ normalizedJobId: scoredJobs.normalizedJobId })
    .from(scoredJobs)
    .where(eq(scoredJobs.profileId, profileId))
    .all();
  const scoredIds = new Set(allScored.map(s => s.normalizedJobId));

  const allJobs = db.select()
    .from(normalizedJobs)
    .where(eq(normalizedJobs.profileId, profileId))
    .all();
  
  const jobsToScore = allJobs.filter(j => !scoredIds.has(j.id));
  const total = jobsToScore.length;

  for (let i = 0; i < total; i++) {
    const job = jobsToScore[i];
    const breakdown = scoreJob(job, masterProfile, searchProfile);
    const tier = determineTier(breakdown.totalScore);

    db.insert(scoredJobs).values({
      profileId: profileId,
      normalizedJobId: job.id,
      masterProfileId: masterProfile.id,
      searchProfileId: searchProfile.id,
      score: breakdown.totalScore,
      tier: tier,
      breakdown: JSON.stringify(breakdown),
      scoredAt: new Date(),
    }).run();

    if (onProgress) {
      onProgress(Math.floor(((i + 1) / total) * 100));
    }
  }
  
  return total;
}
