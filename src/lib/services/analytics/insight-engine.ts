/**
 * Phase J — Insight Engine
 *
 * Evaluates 8 rule-based insight rules against live DB data and persists
 * non-duplicate, non-dismissed insights to the insightItems table.
 * All DB operations are synchronous (better-sqlite3).
 */

import { getDb } from '@/db';
import {
  insightItems,
  applications,
  applicationReminders,
  applicationDocuments,
} from '@/db/schema';
import { eq, and, isNotNull, inArray, sql } from 'drizzle-orm';

import { getApplyLatencyStats, getStaleOpportunities } from './time-analytics-service';
import { getPortalPerformance, getSearchProfilePerformance } from './search-analytics-service';
import { getDocumentSummary, getHighAtsUnusedJobs } from './document-analytics-service';

// ─── Public Types ─────────────────────────────────────────────────────────────

export type InsightItem = typeof insightItems.$inferSelect;

interface InsightResult {
  insightType: string;
  title: string;
  body: string;
  confidence: 'low' | 'medium' | 'high';
  recommendedAction?: string;
  metricBasis?: string;   // JSON string
  supportingData?: string; // JSON string
  timeWindow?: string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Check whether an active (non-dismissed) insight of the given type already
 * exists.  If so, skip insertion to avoid duplicates.
 */
function insightExists(insightType: string): boolean {
  const db = getDb();
  const row = db
    .select({ cnt: sql<number>`count(*)` })
    .from(insightItems)
    .where(
      and(
        eq(insightItems.insightType, insightType),
        eq(insightItems.isDismissed, false),
      ),
    )
    .get();
  return (row?.cnt ?? 0) > 0;
}

function saveInsight(result: InsightResult): void {
  const db = getDb();
  db
    .insert(insightItems)
    .values({
      insightType: result.insightType,
      title: result.title,
      body: result.body,
      confidence: result.confidence,
      recommendedAction: result.recommendedAction ?? null,
      metricBasis: result.metricBasis ?? null,
      supportingData: result.supportingData ?? null,
      timeWindow: result.timeWindow ?? 'all_time',
      isDismissed: false,
      generatedAt: new Date(),
    })
    .run();
}

// ─── Rule 1: portalPerformanceInsight ─────────────────────────────────────────

function portalPerformanceInsight(): InsightResult | null {
  const portals = getPortalPerformance();

  // Only consider portals with enough signal
  const qualified = portals.filter((p) => p.totalScored >= 5);
  if (qualified.length === 0) return null;

  const best = qualified.reduce((a, b) =>
    (a.tierARate ?? 0) >= (b.tierARate ?? 0) ? a : b,
  );

  const tierARate = best.tierARate ?? 0;
  if (tierARate === 0) return null;

  const confidence: 'high' | 'medium' = tierARate > 20 ? 'high' : 'medium';

  return {
    insightType: 'portal_performance',
    title: `${best.portal} is your strongest job source`,
    body: `${tierARate}% of ${best.portal} jobs are Tier A — your strongest source.`,
    confidence,
    recommendedAction: `Focus your next scan on ${best.portal} to maximise Tier A matches.`,
    metricBasis: JSON.stringify({ portal: best.portal, tierARate, totalScored: best.totalScored }),
    timeWindow: 'all_time',
  };
}

// ─── Rule 2: applyRateInsight ─────────────────────────────────────────────────

function applyRateInsight(): InsightResult | null {
  const summary = getDocumentSummary();
  const { totalResumes } = summary;
  if (totalResumes < 5) return null;

  const appliedRow = getDb()
    .select({ cnt: sql<number>`count(*)` })
    .from(applications)
    .where(isNotNull(applications.appliedAt))
    .get();
  const appliedCount = appliedRow?.cnt ?? 0;

  const rate = totalResumes > 0 ? appliedCount / totalResumes : 1;
  if (rate >= 0.5) return null;

  return {
    insightType: 'apply_rate',
    title: 'Resume generation is outpacing applications',
    body: `Generated ${totalResumes} resumes but applied to only ${appliedCount}.`,
    confidence: 'medium',
    recommendedAction: 'Review saved resumes and submit applications for strong matches.',
    metricBasis: JSON.stringify({ resumeCount: totalResumes, appliedCount }),
    timeWindow: 'all_time',
  };
}

// ─── Rule 3: staleOpportunityInsight ─────────────────────────────────────────

function staleOpportunityInsight(): InsightResult | null {
  const stale = getStaleOpportunities(7);
  const staleCount = stale.length;
  if (staleCount < 3) return null;

  return {
    insightType: 'stale_opportunity',
    title: `${staleCount} high-tier opportunities going stale`,
    body: `${staleCount} high-tier opportunities sitting >7 days without action.`,
    confidence: 'high',
    recommendedAction: 'Review and either apply or archive these opportunities.',
    metricBasis: JSON.stringify({ staleCount, staleDays: 7 }),
    supportingData: JSON.stringify(
      stale.slice(0, 10).map((s) => ({
        applicationId: s.applicationId,
        title: s.title,
        company: s.company,
        daysStale: s.daysStale,
      })),
    ),
    timeWindow: '7d',
  };
}

// ─── Rule 4: followUpEffectInsight ────────────────────────────────────────────

function followUpEffectInsight(): InsightResult | null {
  const db = getDb();

  // Applications with at least one completed reminder
  const withReminderRows = db
    .select({ applicationId: applicationReminders.applicationId })
    .from(applicationReminders)
    .where(eq(applicationReminders.isCompleted, true))
    .all();

  const withReminderIds = Array.from(
    new Set(withReminderRows.map((r) => r.applicationId)),
  );

  if (withReminderIds.length < 3) return null;

  // All application ids
  const allApps = db
    .select({ id: applications.id, status: applications.status })
    .from(applications)
    .all();

  if (allApps.length < 6) return null;

  const progressedStatuses = new Set([
    'recruiter_replied',
    'interview_scheduled',
    'interviewed',
    'offer',
  ]);

  const withReminderSet = new Set(withReminderIds);

  const withReminder = allApps.filter((a) => withReminderSet.has(a.id));
  const withoutReminder = allApps.filter((a) => !withReminderSet.has(a.id));

  if (withReminder.length < 3 || withoutReminder.length < 3) return null;

  const progRate = (arr: typeof allApps) =>
    arr.filter((a) => progressedStatuses.has(a.status)).length / arr.length;

  const rateWith = progRate(withReminder);
  const rateWithout = progRate(withoutReminder);
  const diff = rateWith - rateWithout;

  // Only surface if there is a visible positive difference (>5pp)
  if (diff <= 0.05) return null;

  const pctWith = Math.round(rateWith * 100);
  const pctWithout = Math.round(rateWithout * 100);

  return {
    insightType: 'follow_up_effect',
    title: 'Reminders correlate with better outcomes',
    body: `Applications with a completed follow-up progress ${pctWith}% of the time vs ${pctWithout}% without.`,
    confidence: 'medium',
    recommendedAction: 'Set follow-up reminders on all active Tier A applications.',
    metricBasis: JSON.stringify({ rateWith: pctWith, rateWithout: pctWithout, sample: allApps.length }),
    timeWindow: 'all_time',
  };
}

// ─── Rule 5: atsGapInsight ────────────────────────────────────────────────────

function atsGapInsight(): InsightResult | null {
  const highAtsUnused = getHighAtsUnusedJobs(80);
  if (highAtsUnused.length < 3) return null;

  return {
    insightType: 'ats_gap',
    title: `${highAtsUnused.length} high-ATS resumes not yet submitted`,
    body: `${highAtsUnused.length} high-ATS applications not yet submitted.`,
    confidence: 'medium',
    recommendedAction: 'Submit applications for jobs where your resume already scores 80+.',
    metricBasis: JSON.stringify({ count: highAtsUnused.length, minAts: 80 }),
    supportingData: JSON.stringify(
      highAtsUnused.slice(0, 10).map((j) => ({
        scoredJobId: j.scoredJobId,
        title: j.title,
        company: j.company,
        atsScore: j.atsScore,
        tier: j.tier,
      })),
    ),
    timeWindow: 'all_time',
  };
}

// ─── Rule 6: timeToApplyInsight ───────────────────────────────────────────────

function timeToApplyInsight(): InsightResult | null {
  const latency = getApplyLatencyStats();
  if (latency.avgDays === null || latency.avgDays <= 5) return null;
  if (latency.medianDaysToApply === null) return null;

  const confidence: 'low' | 'medium' =
    latency.sampleSize < 5 ? 'low' : 'medium';

  return {
    insightType: 'time_to_apply',
    title: 'You are taking too long to apply',
    body: `Average ${latency.avgDays} days to apply. Median is ${latency.medianDaysToApply} days.`,
    confidence,
    recommendedAction: 'Aim to apply within 3 days of saving a high-tier opportunity.',
    metricBasis: JSON.stringify({
      avgDays: latency.avgDays,
      medianDays: latency.medianDaysToApply,
      sampleSize: latency.sampleSize,
    }),
    timeWindow: 'all_time',
  };
}

// ─── Rule 7: searchProfileYieldInsight ───────────────────────────────────────

function searchProfileYieldInsight(): InsightResult | null {
  const profiles = getSearchProfilePerformance();
  if (profiles.length < 2) return null;

  const sorted = [...profiles].sort(
    (a, b) => (b.tierARate ?? 0) - (a.tierARate ?? 0),
  );

  const top = sorted[0];
  const topTierACount = top.tierACount ?? 0;
  if (topTierACount < 3) return null;

  // Compare to average of all other profiles
  const others = sorted.slice(1);
  const othersAvgTierA =
    others.reduce((s, p) => s + (p.tierACount ?? 0), 0) / others.length;

  if (topTierACount - othersAvgTierA < 3) return null;

  return {
    insightType: 'search_profile_yield',
    title: `'${top.title}' is your top-performing search profile`,
    body: `Your '${top.title}' profile generates the most Tier A matches (${topTierACount} so far).`,
    confidence: 'medium',
    recommendedAction: `Run more scans with the '${top.title}' profile to maximise Tier A matches.`,
    metricBasis: JSON.stringify({
      profileId: top.searchProfileId,
      profileTitle: top.title,
      tierACount: topTierACount,
      tierARate: top.tierARate,
      othersAvgTierA: Math.round(othersAvgTierA * 10) / 10,
    }),
    timeWindow: 'all_time',
  };
}

// ─── Rule 8: coverLetterUsageInsight ─────────────────────────────────────────

function coverLetterUsageInsight(): InsightResult | null {
  const db = getDb();

  // Total applied applications
  const appliedRows = db
    .select({ id: applications.id })
    .from(applications)
    .where(isNotNull(applications.appliedAt))
    .all();

  const totalApplied = appliedRows.length;
  if (totalApplied < 5) return null;

  const appliedIds = appliedRows.map((r) => r.id);

  // Applied applications that have a linked cover letter
  const coveredRow = db
    .select({ cnt: sql<number>`count(distinct ${applicationDocuments.applicationId})` })
    .from(applicationDocuments)
    .where(
      and(
        eq(applicationDocuments.documentType, 'cover_letter'),
        inArray(applicationDocuments.applicationId, appliedIds),
      ),
    )
    .get();
  const coveredCount = coveredRow?.cnt ?? 0;

  const pct = Math.round((coveredCount / totalApplied) * 100);
  if (pct >= 30) return null;

  return {
    insightType: 'cover_letter_usage',
    title: 'Low cover letter usage in applications',
    body: `Only ${pct}% of your applications include a cover letter.`,
    confidence: 'low',
    recommendedAction: 'Generate cover letters for Tier A applications to stand out.',
    metricBasis: JSON.stringify({ pct, coveredCount, totalApplied }),
    timeWindow: 'all_time',
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

type RuleFn = () => InsightResult | null;

const RULES: Array<{ name: string; fn: RuleFn }> = [
  { name: 'portalPerformanceInsight',     fn: portalPerformanceInsight },
  { name: 'applyRateInsight',             fn: applyRateInsight },
  { name: 'staleOpportunityInsight',      fn: staleOpportunityInsight },
  { name: 'followUpEffectInsight',        fn: followUpEffectInsight },
  { name: 'atsGapInsight',               fn: atsGapInsight },
  { name: 'timeToApplyInsight',           fn: timeToApplyInsight },
  { name: 'searchProfileYieldInsight',    fn: searchProfileYieldInsight },
  { name: 'coverLetterUsageInsight',      fn: coverLetterUsageInsight },
];

/**
 * Run all insight rules. For each rule that fires and does not already have a
 * live (non-dismissed) entry in insightItems, persist the result.
 *
 * Returns a summary of how many new insights were generated and which rules
 * fired.
 */
export function runInsightEngine(): { generated: number; rules: string[] } {
  const generated: string[] = [];

  for (const rule of RULES) {
    let result: InsightResult | null = null;

    try {
      result = rule.fn();
    } catch {
      // Individual rule failures must not crash the whole engine
      continue;
    }

    if (result === null) continue;
    if (insightExists(result.insightType)) continue;

    try {
      saveInsight(result);
      generated.push(rule.name);
    } catch {
      // Persistence failure — skip silently
    }
  }

  return { generated: generated.length, rules: generated };
}

/**
 * Return active (non-dismissed) insights ordered by generatedAt desc.
 */
export function getActiveInsights(limit: number = 20): InsightItem[] {
  const db = getDb();

  return db
    .select()
    .from(insightItems)
    .where(eq(insightItems.isDismissed, false))
    .orderBy(sql`${insightItems.generatedAt} desc`)
    .limit(limit)
    .all();
}

/**
 * Mark a single insight as dismissed.
 */
export function dismissInsight(id: number): void {
  const db = getDb();
  db
    .update(insightItems)
    .set({ isDismissed: true })
    .where(eq(insightItems.id, id))
    .run();
}

/**
 * Hard-delete all insight rows (useful for a full refresh).
 */
export function clearInsights(): void {
  const db = getDb();
  db.delete(insightItems).run();
}
