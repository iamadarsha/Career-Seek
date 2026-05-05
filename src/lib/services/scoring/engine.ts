import { getDb } from '../../../db';
import { masterProfiles, searchProfiles, normalizedJobs, scoredJobs, jobDuplicates } from '../../../db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { resolveContext } from '@/lib/platform/identity';
import { inferRoleFamilies } from '../scraping/role-family-packs';
import { expandSkillTerms } from '../skills/taxonomy';
import { SCORING_THRESHOLDS } from '../../constants/scoring';
import { indexJobs, type SearchableJob } from '../../search';

export interface ScoreBreakdown {
  titleScore: number;
  skillScore: number;
  locationScore: number;
  experienceScore: number;
  workModeScore: number;
  keywordScore: number;
  qualityScore: number;
  totalScore: number;
  positiveFactors: string[];
  negativeFactors: string[];
  warnings: string[];
}

function isScorableJob(job: typeof normalizedJobs.$inferSelect) {
  const title = String(job.title || '').trim();
  const company = String(job.company || '').trim();
  const url = String(job.applyUrl || job.url || '');
  if (/\/undefined(?:$|[/?#])/i.test(url)) return false;
  if (/^foundit job$/i.test(title) && /^company not listed$/i.test(company)) return false;
  if (/<[^>]+>|src=|data-nimg|logo\.svg/i.test(title)) return false;
  if (isGenericNonJobListing(job)) return false;
  return true;
}

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

function searchableJobFromScore(
  scoredJob: { id: number; score: number; tier: string },
  job: any,
  breakdown: ScoreBreakdown,
): SearchableJob {
  return {
    id: scoredJob.id,
    title: String(job.title || ''),
    company: String(job.company || ''),
    location: job.location,
    portal: job.portal,
    url: job.url,
    applyUrl: job.applyUrl,
    snippet: job.snippet,
    employmentType: job.employmentType,
    isRemote: job.isRemote,
    isHybrid: job.isHybrid,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    salaryCurrency: job.salaryCurrency,
    experienceMin: job.experienceMin,
    experienceMax: job.experienceMax,
    postedDate: job.postedDate,
    scrapedAt: job.scrapedAt,
    score: scoredJob.score,
    tier: scoredJob.tier,
    positiveFactors: breakdown.positiveFactors,
    negativeFactors: breakdown.negativeFactors,
    warnings: breakdown.warnings,
  };
}

function normalizeText(value: unknown) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitTerms(value: unknown) {
  const importantShortTerms = new Set(['ai', 'ml', 'pm', 'hr', 'qa', 'ux', 'ui', 'it', 'bi']);
  return normalizeText(value)
    .split(' ')
    .filter((term) => (term.length > 2 || importantShortTerms.has(term)) && !['and', 'the', 'for', 'with'].includes(term));
}

function countMatches(haystack: string, values: string[]) {
  const seen = new Set<string>();
  let matches = 0;
  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    if (haystack.includes(normalized)) matches++;
  }
  return matches;
}

const GENERIC_JOB_TITLE_PATTERNS = [
  /^careers?$/i,
  /^my career$/i,
  /^search results?$/i,
  /^join our talent community$/i,
  /^manage preferences$/i,
  /^skip to main content\.?$/i,
  /^business sector$/i,
  /^learning and development$/i,
  /^how we hire$/i,
  /^resume database packages$/i,
  /^jobs by role$/i,
  /^teacher jobs \d+ openings$/i,
  /^explore courses$/i,
  /^top \d+\+ .* interview questions/i,
];

const NON_JOB_CONTENT_PATTERNS = [
  /privacy|terms|cookie|accessibility|equal opportunity|fraud alert/i,
  /talent community|recruitment process|how we hire|learning and development|interview questions|explore courses/i,
  /join our talent community|manage preferences|skip to main content/i,
];

const ENTRY_LEVEL_PATTERN = /\b(intern|internship|trainee|graduate|campus|fresher|entry level|apprentice)\b/i;
const SENIOR_ROLE_PATTERN = /\b(head|director|principal|staff|lead|manager|architect)\b/i;
const PRIMARY_SCHOOL_PATTERN = /\b(primary|pre primary|nursery|kindergarten|kg)\b/i;
const PHYSICS_MISMATCH_PATTERN = /\b(economics|arts|marathi|hindi|skating|swimming|front desk|community manager)\b/i;
const GENERIC_TITLE_TERMS = new Set([
  'manager',
  'senior',
  'associate',
  'lead',
  'head',
  'director',
  'specialist',
  'executive',
  'officer',
  'consultant',
  'role',
  'jobs',
  'job',
]);
const PRODUCT_PM_INTENT_PATTERN = /\b(?:ai|genai|llm|technical|growth|associate|senior|group|principal|platform|b2b|saas)?\s*product\s+(?:manager|management|owner|lead|analyst|strategy|ops|operations|growth)\b|\b(?:apm|pm)\b/i;
const PRODUCT_ROLE_TITLE_PATTERN = /\b(?:ai|genai|llm|technical|growth|associate|senior|group|principal|platform|b2b|saas)?\s*product\s+(?:manager|management|owner|lead|analyst|director|strategy|ops|operations|growth)\b|\b(?:apm)\b/i;
const STRATEGY_OPS_PM_MISMATCH_PATTERN = /\b(strategy\s*(?:and|&)?\s*ops|strategy ops|bizops|business operations|chief of staff|founder'?s?\s+office|operations manager|strategy manager|program manager)\b/i;
const NON_PRODUCT_STRATEGY_OPS_TITLE_PATTERN = /\b(strategy\s*(?:and|&)?\s*ops|strategy ops|bizops|business operations|chief of staff|founder'?s?\s+office|operations manager|strategy manager|business strategy|operations lead)\b/i;
const HR_PM_MISMATCH_PATTERN = /\b(hr|human resources|hrbp|people operations|talent acquisition|recruiter|recruiting|payroll)\b/i;

function hasProductManagementIntent(value: unknown) {
  return PRODUCT_PM_INTENT_PATTERN.test(String(value || ''));
}

function hasProductRoleTitleSignal(title: unknown, snippet?: unknown) {
  const titleText = String(title || '');
  const combined = `${titleText} ${String(snippet || '')}`;
  return PRODUCT_ROLE_TITLE_PATTERN.test(titleText) || (
    /\bproduct\b/i.test(titleText) &&
    /\b(roadmap|prd|discovery|experimentation|user research|analytics|gtm|go-to-market|product management)\b/i.test(combined)
  );
}

function isKeywordSoup(value: string) {
  const normalized = normalizeText(value);
  if (
    /data analytics data analytics|data engineering data engineering|teacher jobs \d+ openings|jobs by role|interview questions|explore courses/i.test(value)
  ) {
    return true;
  }
  const terms = normalized.split(' ').filter(Boolean);
  if (terms.length < 10) return false;
  const uniqueRatio = new Set(terms).size / terms.length;
  return uniqueRatio < 0.72;
}

function isGenericNonJobListing(job: typeof normalizedJobs.$inferSelect) {
  const title = String(job.title || '').trim();
  const company = String(job.company || '').trim();
  const snippet = String(job.snippet || '').trim();
  const url = String(job.applyUrl || job.url || '');
  const haystack = `${title} ${snippet} ${url}`;
  const normalizedTitle = normalizeText(title);
  const normalizedSnippet = normalizeText(snippet);

  if (!title) return true;
  if (GENERIC_JOB_TITLE_PATTERNS.some((pattern) => pattern.test(title))) return true;
  if (NON_JOB_CONTENT_PATTERNS.some((pattern) => pattern.test(haystack))) return true;
  if (normalizedSnippet && normalizedSnippet === normalizedTitle && splitTerms(title).length <= 4) return true;
  if (/company not listed/i.test(company) && !job.experienceMin && !job.experienceMax) {
    if (!snippet || normalizedSnippet === normalizedTitle) return true;
    if (normalizedSnippet.startsWith(normalizedTitle) && splitTerms(snippet).length >= 10) return true;
  }
  if (isKeywordSoup(`${title} ${snippet}`)) return true;
  return false;
}

export function scoreJob(job: any, master: any, search: any): ScoreBreakdown {
  let totalScore = 0;
  const positiveFactors: string[] = [];
  const negativeFactors: string[] = [];
  const warnings: string[] = [];
  const jobTitle = String(job.title || '');
  const jobSnippet = String(job.snippet || '');
  const searchTitle = String(search.title || '');
  const jobText = normalizeText([jobTitle, jobSnippet, job.company, job.location].filter(Boolean).join(' '));

  // 1. Title Relevance (Max 20)
  let titleScore = 0;
  const normalizedSearchTitle = searchTitle.toLowerCase();
  const normalizedJobTitle = jobTitle.toLowerCase();
  const titleTerms = splitTerms(searchTitle);
  const intentTitleTerms = titleTerms.filter((term) => !GENERIC_TITLE_TERMS.has(term));
  const searchIntentText = [
    searchTitle,
    search.experienceBand,
    JSON.stringify(safeParseJSON(search.mustHaveKeywords)),
  ].filter(Boolean).join(' ');
  const searchHasProductIntent = hasProductManagementIntent(searchIntentText);
  const jobHasProductTitleSignal = hasProductRoleTitleSignal(jobTitle, jobSnippet);
  const searchRoleFamilies = inferRoleFamilies([
    searchTitle,
    ...safeParseJSON(search.mustHaveKeywords),
  ]);
  const jobRoleFamilies = inferRoleFamilies([
    jobTitle,
    jobSnippet,
  ]);

  if (normalizedSearchTitle && normalizedJobTitle.includes(normalizedSearchTitle)) {
    titleScore = 20;
    positiveFactors.push('Exact title match');
  } else if (intentTitleTerms.some((word) => normalizedJobTitle.includes(word))) {
    titleScore = 10;
    positiveFactors.push('Partial title match');
  } else if (titleTerms.some((word) => normalizedJobTitle.includes(word))) {
    titleScore = 5;
    positiveFactors.push('Weak title overlap');
  }

  if (searchHasProductIntent) {
    if (jobHasProductTitleSignal) {
      titleScore = Math.min(20, titleScore + (titleScore > 0 ? 5 : 10));
      positiveFactors.push('Product role title matches PM intent');
    } else {
      titleScore = Math.min(titleScore, 6);
      negativeFactors.push('Job title is not product-focused for this PM search');
    }
  } else if (searchRoleFamilies.some((family) => jobRoleFamilies.includes(family))) {
    titleScore = Math.min(20, titleScore + (titleScore > 0 ? 5 : 8));
    positiveFactors.push('Matches target role family');
  } else {
    negativeFactors.push('Title does not match search intent closely');
  }
  totalScore += titleScore;

  // 2. Skill Overlap (Max 30)
  let skillScore = 0;
  const explicitSkills = safeParseJSON(master.skillsExplicit);
  const inferredSkills = safeParseJSON(master.skillsInferred);
  const allSkills = [...explicitSkills, ...inferredSkills];
  const canonicalTerms = expandSkillTerms(allSkills);
  const relatedTerms = expandSkillTerms(allSkills, { includeRelated: true, relatedLimit: 2 })
    .filter((term) => !canonicalTerms.some((canonical) => normalizeText(canonical) === normalizeText(term)));
  const matchCount = countMatches(jobText, canonicalTerms);
  const relatedMatchCount = countMatches(jobText, relatedTerms);
  const effectiveMatchCount = matchCount + relatedMatchCount * 0.5;

  if (effectiveMatchCount >= 5) {
    skillScore = 30;
    positiveFactors.push('Strong skill overlap');
  } else if (effectiveMatchCount >= 3) {
    skillScore = 20;
    positiveFactors.push('Relevant skill overlap');
  } else if (effectiveMatchCount >= 2) {
    skillScore = 15;
    positiveFactors.push('Moderate skill overlap');
  } else if (effectiveMatchCount >= 1) {
    skillScore = 8;
    positiveFactors.push('Some skill overlap detected');
  } else {
    negativeFactors.push('Few matching skills detected in description');
    warnings.push('Job description might be too short or generic for accurate skill matching');
  }
  if (relatedMatchCount > 0) {
    positiveFactors.push('Related skill taxonomy overlap detected');
  }
  totalScore += skillScore;

  // 3. Experience Fit (Max 20)
  let experienceScore = 0;
  const userExp = Number(master.yearsOfExperience || 0);
  const jobExpMin = job.experienceMin;
  const jobExpMax = job.experienceMax;
  const searchText = normalizeText([
    search.title,
    search.experienceBand,
    JSON.stringify(safeParseJSON(search.mustHaveKeywords)),
  ].filter(Boolean).join(' '));
  const searchIsEntryLevel = ENTRY_LEVEL_PATTERN.test(searchText) || userExp <= 1;
  const jobIsEntryLevel = ENTRY_LEVEL_PATTERN.test(jobText);

  if (jobExpMin != null && jobExpMax != null) {
    if (userExp >= jobExpMin && userExp <= jobExpMax) {
      experienceScore = 20;
      positiveFactors.push('Experience level is a perfect fit');
    } else if (userExp > jobExpMax) {
      if (jobIsEntryLevel && userExp >= 3) {
        experienceScore = 0;
        negativeFactors.push('Strong seniority mismatch for an internship/trainee role');
        warnings.push('This job is likely too junior for the profile');
      } else if (userExp > jobExpMax + 2) {
        experienceScore = 4;
        warnings.push('Potentially overqualified for this role');
      } else {
        experienceScore = 8;
        warnings.push('Potentially overqualified for this role');
      }
    } else if (userExp < jobExpMin && userExp >= jobExpMin - 1) {
      experienceScore = 10;
      negativeFactors.push('Slightly under expected experience level');
    } else {
      negativeFactors.push('Significant experience mismatch');
    }
  } else {
    if (jobIsEntryLevel && searchIsEntryLevel) {
      experienceScore = 15;
      positiveFactors.push('Entry-level seniority looks aligned');
    } else if (jobIsEntryLevel && userExp >= 3) {
      experienceScore = 2;
      negativeFactors.push('Internship/trainee role is much junior than the profile');
    } else {
      experienceScore = 8;
    }
    warnings.push('No explicit experience requirements found in job post');
  }
  totalScore += experienceScore;

  // 4. Work Mode Fit (Max 15)
  let workModeScore = 0;
  const prefMode = search.workModel?.toLowerCase();
  
  if (prefMode === 'remote' && job.isRemote) {
    workModeScore = 15;
    positiveFactors.push('Matches remote preference');
  } else if (prefMode === 'hybrid' && job.isHybrid) {
    workModeScore = 15;
    positiveFactors.push('Matches hybrid preference');
  } else if (prefMode === 'onsite' && !job.isRemote && !job.isHybrid) {
    workModeScore = 15;
    positiveFactors.push('Matches onsite preference');
  } else if (!prefMode) {
    workModeScore = 15;
  } else {
    workModeScore = 5;
    negativeFactors.push(`Does not perfectly match ${prefMode} preference`);
  }
  totalScore += workModeScore;

  // 5. Keyword Include/Exclude (Max 15, can be negative)
  let keywordScore = 0;
  const mustHaves = safeParseJSON(search.mustHaveKeywords);
  const avoids = safeParseJSON(search.avoidKeywords);

  const matchedMustHaves = mustHaves.filter((kw: string) => {
    const normalized = normalizeText(kw);
    return normalized ? jobText.includes(normalized) : false;
  });

  if (mustHaves.length > 0) {
    keywordScore += Math.round((matchedMustHaves.length / mustHaves.length) * 15);
    if (matchedMustHaves.length === mustHaves.length) {
      positiveFactors.push('Contains all must-have keywords');
    } else if (matchedMustHaves.length > 0) {
      positiveFactors.push(`Matches ${matchedMustHaves.length} of ${mustHaves.length} must-have keywords`);
    } else {
      negativeFactors.push('Missing must-have keywords');
    }
  } else {
    keywordScore += 15;
  }

  let hasAvoid = false;
  avoids.forEach((kw: string) => {
    const normalized = normalizeText(kw);
    if (normalized && jobText.includes(normalized)) hasAvoid = true;
  });

  if (hasAvoid) {
    keywordScore -= 20;
    negativeFactors.push('Contains avoid keywords');
  }
  totalScore += keywordScore;

  // 6. Listing Quality / Seniority / Domain Sanity (can be negative)
  let qualityScore = 0;
  const isGenericListing = isGenericNonJobListing(job);
  const searchWantsSeniorTeaching = /\bpgt\b|secondary|high school|grade 11|grade 12/.test(searchText);
  const searchWantsPhysics = /\bphysics\b/.test(searchText);
  const searchWantsScience = /\bscience\b/.test(searchText);

  if (isGenericListing) {
    qualityScore -= 25;
    negativeFactors.push('Listing looks like a careers/info page or taxonomy page, not a specific role');
  } else if (job.company && !/company not listed/i.test(String(job.company))) {
    qualityScore += 4;
    positiveFactors.push('Listing contains concrete employer details');
  }

  if (searchIsEntryLevel && jobIsEntryLevel) {
    qualityScore += 10;
    positiveFactors.push('Entry-level role aligns with fresher/intern search');
  }

  if (!searchIsEntryLevel && jobIsEntryLevel && userExp >= 3) {
    qualityScore -= 18;
    negativeFactors.push('Role is too junior for the candidate seniority');
  }

  if (searchIsEntryLevel && SENIOR_ROLE_PATTERN.test(jobTitle)) {
    qualityScore -= 14;
    negativeFactors.push('Role appears too senior for an entry-level search');
  }

  if (searchHasProductIntent && !jobHasProductTitleSignal) {
    const looksLikeStrategyOpsOrHr =
      STRATEGY_OPS_PM_MISMATCH_PATTERN.test(jobTitle) ||
      HR_PM_MISMATCH_PATTERN.test(jobTitle);
    qualityScore -= looksLikeStrategyOpsOrHr ? 22 : 10;
    negativeFactors.push(
      looksLikeStrategyOpsOrHr
        ? 'Strategy/Ops/HR title is not a close Product Manager match'
        : 'Product intent is weak in the job title',
    );
  }

  if (searchHasProductIntent && jobHasProductTitleSignal) {
    qualityScore += 6;
    positiveFactors.push('PM role-family weighting favors explicit product roles');
  }

  if (
    searchHasProductIntent &&
    !jobHasProductTitleSignal &&
    NON_PRODUCT_STRATEGY_OPS_TITLE_PATTERN.test(`${jobTitle} ${jobSnippet}`)
  ) {
    qualityScore -= 16;
    negativeFactors.push('PM role-family weighting downranks non-product Strategy/Ops roles');
  }

  if (searchWantsSeniorTeaching && PRIMARY_SCHOOL_PATTERN.test(jobText)) {
    qualityScore -= 18;
    negativeFactors.push('Primary-school role mismatches senior-secondary teaching background');
  }

  if ((searchWantsPhysics || searchWantsScience) && /\b(physics|science)\b/.test(jobText)) {
    qualityScore += 8;
    positiveFactors.push('Subject alignment with Physics/Science teaching');
  }

  if (searchWantsPhysics && PHYSICS_MISMATCH_PATTERN.test(jobText) && !/\b(physics|science)\b/.test(jobText)) {
    qualityScore -= 14;
    negativeFactors.push('Subject or function mismatch for a Physics-focused teaching search');
  }

  if (
    /official employer careers result found/i.test(String(job.snippet || '')) &&
    !/(requisition|requirements|responsibilities|opening|job id|apply)/i.test(String(job.title || '') + ' ' + String(job.snippet || ''))
  ) {
    qualityScore -= 8;
    warnings.push('Official result may still be a navigation page rather than a real job posting');
  }

  totalScore += qualityScore;

  if (
    searchHasProductIntent &&
    !jobHasProductTitleSignal &&
    NON_PRODUCT_STRATEGY_OPS_TITLE_PATTERN.test(`${jobTitle} ${jobSnippet}`)
  ) {
    totalScore = Math.min(totalScore, 44);
    warnings.push('Capped because this looks like Strategy/Ops rather than Product Management');
  }

  // Bound score 0-100
  totalScore = Math.max(0, Math.min(100, totalScore));

  return {
    titleScore,
    skillScore,
    locationScore: 0, // simplified for now
    experienceScore,
    workModeScore,
    keywordScore,
    qualityScore,
    totalScore,
    positiveFactors,
    negativeFactors,
    warnings,
  };
}

export async function upsertScoreForNormalizedJob(profileId: number, normalizedJobId: number) {
  const db = getDb();
  const searchProfile = db.select().from(searchProfiles)
    .where(and(eq(searchProfiles.isActive, true), eq(searchProfiles.profileId, profileId)))
    .orderBy(desc(searchProfiles.id))
    .get();
  const masterProfile = db.select().from(masterProfiles)
    .where(eq(masterProfiles.profileId, profileId))
    .orderBy(desc(masterProfiles.updatedAt), desc(masterProfiles.id))
    .get();
  const job = db.select().from(normalizedJobs)
    .where(and(eq(normalizedJobs.id, normalizedJobId), eq(normalizedJobs.profileId, profileId)))
    .get();

  const allowManualOverride = job?.portal === 'manual_url' || job?.portal === 'google_jobs';
  if (!searchProfile || !masterProfile || !job || (!allowManualOverride && !isScorableJob(job))) return null;

  const breakdown = scoreJob(job, masterProfile, searchProfile);
  const nextScore = breakdown.totalScore;
  const nextTier = determineTier(nextScore);
  const existing = db.select().from(scoredJobs)
    .where(and(eq(scoredJobs.normalizedJobId, normalizedJobId), eq(scoredJobs.profileId, profileId)))
    .get();

  const baseValues = {
    masterProfileId: masterProfile.id,
    searchProfileId: searchProfile.id,
    score: nextScore,
    tier: nextTier,
    breakdown: JSON.stringify(breakdown),
    scoredAt: new Date(),
  };

  const scored = existing
    ? (() => {
        db.update(scoredJobs).set(baseValues).where(eq(scoredJobs.id, existing.id)).run();
        return {
          ...existing,
          ...baseValues,
        };
      })()
    : db.insert(scoredJobs).values({
        profileId,
        normalizedJobId,
        ...baseValues,
      }).returning().get();

  try {
    await indexJobs([
      searchableJobFromScore(
        { id: scored.id, score: nextScore, tier: nextTier },
        job,
        breakdown,
      ),
    ], { timeoutMs: 650 });
  } catch (error) {
    console.warn('Local job search indexing skipped:', error instanceof Error ? error.message : error);
  }

  return scored;
}

export async function scoreUnscoredJobs(profileId: number, onProgress?: (progress: number) => void) {
  const db = getDb();
  const jobsToIndex: SearchableJob[] = [];
  
  // Find active profiles for this specific user profile
  const searchProfile = db.select().from(searchProfiles)
    .where(and(eq(searchProfiles.isActive, true), eq(searchProfiles.profileId, profileId)))
    .orderBy(desc(searchProfiles.id))
    .get();
  if (!searchProfile) return 0;
  
  // Always score against the latest resume-derived master profile.
  // Older validation/profile rows can otherwise leak into new scored jobs.
  const masterProfile = db.select().from(masterProfiles)
    .where(eq(masterProfiles.profileId, profileId))
    .orderBy(desc(masterProfiles.updatedAt), desc(masterProfiles.id))
    .get();
  if (!masterProfile) return 0;
 
  // Find all normalized jobs for this profile that don't have a scoredJob entry
  const allScored = db.select({ normalizedJobId: scoredJobs.normalizedJobId })
    .from(scoredJobs)
    .where(eq(scoredJobs.profileId, profileId))
    .all();
  const scoredIds = new Set(allScored.map(s => s.normalizedJobId));

  const staleScoredRows = db.select()
    .from(scoredJobs)
    .innerJoin(normalizedJobs, eq(scoredJobs.normalizedJobId, normalizedJobs.id))
    .where(and(eq(scoredJobs.profileId, profileId), eq(normalizedJobs.profileId, profileId)))
    .all()
    .filter((row) => row.scored_jobs.masterProfileId !== masterProfile.id);

  for (const row of staleScoredRows) {
    const breakdown = scoreJob(row.normalized_jobs, masterProfile, searchProfile);
    const nextScore = breakdown.totalScore;
    const nextTier = determineTier(nextScore);
    db.update(scoredJobs)
      .set({
        masterProfileId: masterProfile.id,
        searchProfileId: searchProfile.id,
        score: nextScore,
        tier: nextTier,
        breakdown: JSON.stringify(breakdown),
        scoredAt: new Date(),
      })
      .where(eq(scoredJobs.id, row.scored_jobs.id))
      .run();
    jobsToIndex.push(searchableJobFromScore(
      { id: row.scored_jobs.id, score: nextScore, tier: nextTier },
      row.normalized_jobs,
      breakdown,
    ));
  }

  const allJobs = db.select()
    .from(normalizedJobs)
    .where(eq(normalizedJobs.profileId, profileId))
    .all();
  
  const duplicateRows = db.select({ duplicateJobId: jobDuplicates.duplicateJobId }).from(jobDuplicates).all();
  const duplicateIds = new Set(duplicateRows.map((row) => row.duplicateJobId));
  const jobsToScore = allJobs.filter(j => isScorableJob(j) && !scoredIds.has(j.id) && !duplicateIds.has(j.id));
  const total = jobsToScore.length;

  for (let i = 0; i < total; i++) {
    const job = jobsToScore[i];
    const breakdown = scoreJob(job, masterProfile, searchProfile);
    const tier = determineTier(breakdown.totalScore);

    const inserted = db.insert(scoredJobs).values({
      profileId: profileId,
      normalizedJobId: job.id,
      masterProfileId: masterProfile.id,
      searchProfileId: searchProfile.id,
      score: breakdown.totalScore,
      tier: tier,
      breakdown: JSON.stringify(breakdown),
      scoredAt: new Date(),
    }).returning().get();

    jobsToIndex.push(searchableJobFromScore(inserted, job, breakdown));

    if (onProgress) {
      onProgress(Math.floor(((i + 1) / total) * 100));
    }
  }

  if (jobsToIndex.length > 0) {
    try {
      await indexJobs(jobsToIndex, { timeoutMs: 650 });
    } catch (error) {
      console.warn('Local job search indexing skipped:', error instanceof Error ? error.message : error);
    }
  }
  
  return total + staleScoredRows.length;
}
