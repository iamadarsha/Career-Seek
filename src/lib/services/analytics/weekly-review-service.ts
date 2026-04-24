/**
 * Phase J — Weekly Review Service
 *
 * Computes, persists, and retrieves weekly strategy review summaries.
 * All DB operations are synchronous (better-sqlite3).
 */

import { getDb } from '@/db';
import {
  weeklyReviews,
  normalizedJobs,
  scoredJobs,
  applications,
  applicationReminders,
  applicationTimeline,
  insightItems,
} from '@/db/schema';
import {
  eq,
  and,
  gte,
  lte,
  lt,
  desc,
  sql,
  isNotNull,
} from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface WeeklySummary {
  weekLabel: string;
  weekStart: Date;
  weekEnd: Date;
  metrics: {
    jobsDiscovered: number;
    newTierAOpportunities: number;
    applicationsSubmitted: number;
    followUpsCompleted: number;
    followUpsMissed: number;
    interviewsScheduled: number;
    offersReceived: number;
    rejections: number;
  };
  bestPortal: string | null;
  topInsights: Array<{
    title: string;
    recommendedAction: string | null;
    confidence: string;
  }>;
  staleCount: number;
  lostOpportunities: number;
  suggestedActions: string[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getCurrentWeekBounds(): { start: Date; end: Date } {
  const now = new Date();
  const dow = now.getDay(); // 0 = Sunday
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dow + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { start: monday, end: sunday };
}

/**
 * Formats a week range as e.g. "Apr 14–20, 2026".
 * When start and end share the same month+year the month/year is not repeated.
 */
function formatWeekLabel(start: Date, end: Date): string {
  const startStr = start.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  const endStr = end.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${startStr}–${endStr}`;
}

// ---------------------------------------------------------------------------
// computeWeeklyReview
// ---------------------------------------------------------------------------

export function computeWeeklyReview(): WeeklySummary {
  const db = getDb();
  const { start: weekStart, end: weekEnd } = getCurrentWeekBounds();
  const now = new Date();
  const weekLabel = formatWeekLabel(weekStart, weekEnd);

  // ── jobsDiscovered ──────────────────────────────────────────────────────────
  const jobsDiscoveredRow = db
    .select({ count: sql<number>`count(*)`.as('count') })
    .from(normalizedJobs)
    .where(and(gte(normalizedJobs.scrapedAt, weekStart), lte(normalizedJobs.scrapedAt, weekEnd)))
    .get();
  const jobsDiscovered = Number(jobsDiscoveredRow?.count ?? 0);

  // ── newTierAOpportunities ───────────────────────────────────────────────────
  const tierARow = db
    .select({ count: sql<number>`count(*)`.as('count') })
    .from(scoredJobs)
    .where(
      and(
        eq(scoredJobs.tier, 'A'),
        gte(scoredJobs.scoredAt, weekStart),
        lte(scoredJobs.scoredAt, weekEnd),
      ),
    )
    .get();
  const newTierAOpportunities = Number(tierARow?.count ?? 0);

  // ── applicationsSubmitted ───────────────────────────────────────────────────
  const submittedRow = db
    .select({ count: sql<number>`count(*)`.as('count') })
    .from(applications)
    .where(
      and(
        isNotNull(applications.appliedAt),
        gte(applications.appliedAt, weekStart),
        lte(applications.appliedAt, weekEnd),
      ),
    )
    .get();
  const applicationsSubmitted = Number(submittedRow?.count ?? 0);

  // ── followUpsCompleted ──────────────────────────────────────────────────────
  const followUpsCompletedRow = db
    .select({ count: sql<number>`count(*)`.as('count') })
    .from(applicationReminders)
    .where(
      and(
        eq(applicationReminders.isCompleted, true),
        isNotNull(applicationReminders.completedAt),
        gte(applicationReminders.completedAt, weekStart),
        lte(applicationReminders.completedAt, weekEnd),
      ),
    )
    .get();
  const followUpsCompleted = Number(followUpsCompletedRow?.count ?? 0);

  // ── followUpsMissed ─────────────────────────────────────────────────────────
  const followUpsMissedRow = db
    .select({ count: sql<number>`count(*)`.as('count') })
    .from(applicationReminders)
    .where(
      and(
        eq(applicationReminders.isCompleted, false),
        gte(applicationReminders.dueAt, weekStart),
        lte(applicationReminders.dueAt, weekEnd),
        lt(applicationReminders.dueAt, now),
      ),
    )
    .get();
  const followUpsMissed = Number(followUpsMissedRow?.count ?? 0);

  // ── interviewsScheduled ─────────────────────────────────────────────────────
  const interviewsRow = db
    .select({ count: sql<number>`count(*)`.as('count') })
    .from(applicationTimeline)
    .where(
      and(
        eq(applicationTimeline.eventType, 'interview_scheduled'),
        gte(applicationTimeline.createdAt, weekStart),
        lte(applicationTimeline.createdAt, weekEnd),
      ),
    )
    .get();
  const interviewsScheduled = Number(interviewsRow?.count ?? 0);

  // ── offersReceived ──────────────────────────────────────────────────────────
  const offersRow = db
    .select({ count: sql<number>`count(*)`.as('count') })
    .from(applicationTimeline)
    .where(
      and(
        eq(applicationTimeline.eventType, 'offer_received'),
        gte(applicationTimeline.createdAt, weekStart),
        lte(applicationTimeline.createdAt, weekEnd),
      ),
    )
    .get();
  const offersReceived = Number(offersRow?.count ?? 0);

  // ── rejections ──────────────────────────────────────────────────────────────
  const rejectionsRow = db
    .select({ count: sql<number>`count(*)`.as('count') })
    .from(applicationTimeline)
    .where(
      and(
        eq(applicationTimeline.eventType, 'rejection_recorded'),
        gte(applicationTimeline.createdAt, weekStart),
        lte(applicationTimeline.createdAt, weekEnd),
      ),
    )
    .get();
  const rejections = Number(rejectionsRow?.count ?? 0);

  // ── bestPortal ──────────────────────────────────────────────────────────────
  // Find the portal with the most Tier A scored jobs discovered this week.
  const bestPortalRow = db.get<{ portal: string; cnt: number }>(
    sql`
      SELECT nj.portal, COUNT(*) AS cnt
      FROM ${scoredJobs} sj
      INNER JOIN ${normalizedJobs} nj ON nj.id = sj.normalized_job_id
      WHERE sj.tier = 'A'
        AND sj.scored_at >= ${weekStart.getTime()}
        AND sj.scored_at <= ${weekEnd.getTime()}
        AND nj.portal IS NOT NULL
      GROUP BY nj.portal
      ORDER BY cnt DESC
      LIMIT 1
    `,
  );
  const bestPortal: string | null = bestPortalRow?.portal ?? null;

  // ── topInsights ─────────────────────────────────────────────────────────────
  const insightRows = db
    .select({
      title: insightItems.title,
      recommendedAction: insightItems.recommendedAction,
      confidence: insightItems.confidence,
    })
    .from(insightItems)
    .where(eq(insightItems.isDismissed, false))
    .orderBy(desc(insightItems.generatedAt))
    .limit(3)
    .all();

  const topInsights = insightRows.map((r) => ({
    title: r.title,
    recommendedAction: r.recommendedAction ?? null,
    confidence: r.confidence,
  }));

  // ── staleCount ───────────────────────────────────────────────────────────────
  // Applications with status='saved', savedAt older than (weekStart - 7 days),
  // and tierSnapshot in ('A', 'B').
  const staleThreshold = new Date(weekStart.getTime() - 7 * 24 * 60 * 60 * 1000);

  const staleRow = db
    .select({ count: sql<number>`count(*)`.as('count') })
    .from(applications)
    .where(
      and(
        eq(applications.status, 'saved'),
        lt(applications.savedAt, staleThreshold),
        sql`${applications.tierSnapshot} IN ('A', 'B')`,
      ),
    )
    .get();
  const staleCount = Number(staleRow?.count ?? 0);

  // ── lostOpportunities ────────────────────────────────────────────────────────
  // Rejection events recorded this week (same as rejections metric above).
  const lostOpportunities = rejections;

  // ── suggestedActions ─────────────────────────────────────────────────────────
  const suggestedActions: string[] = [];

  if (staleCount > 0) {
    suggestedActions.push(`Apply to or archive ${staleCount} stale Tier A/B opportunities`);
  }
  if (followUpsMissed > 0) {
    suggestedActions.push(`Catch up on ${followUpsMissed} missed follow-up reminders`);
  }
  if (applicationsSubmitted === 0) {
    suggestedActions.push(`No applications submitted this week — aim for at least 3`);
  }
  if (newTierAOpportunities > 0) {
    suggestedActions.push(`Review ${newTierAOpportunities} new Tier A opportunities discovered this week`);
  }
  suggestedActions.push(`Run your next job scan to refresh your pipeline`);

  return {
    weekLabel,
    weekStart,
    weekEnd,
    metrics: {
      jobsDiscovered,
      newTierAOpportunities,
      applicationsSubmitted,
      followUpsCompleted,
      followUpsMissed,
      interviewsScheduled,
      offersReceived,
      rejections,
    },
    bestPortal,
    topInsights,
    staleCount,
    lostOpportunities,
    suggestedActions,
  };
}

// ---------------------------------------------------------------------------
// saveWeeklyReview
// ---------------------------------------------------------------------------

/**
 * Upserts a weekly review: deletes any existing row for the same weekStart,
 * then inserts the new one.
 */
export function saveWeeklyReview(summary: WeeklySummary): void {
  const db = getDb();

  // Delete any existing review for this weekStart to enforce one-per-week.
  db.delete(weeklyReviews)
    .where(eq(weeklyReviews.weekStart, summary.weekStart))
    .run();

  db.insert(weeklyReviews)
    .values({
      weekStart: summary.weekStart,
      weekEnd: summary.weekEnd,
      summaryJson: JSON.stringify(summary),
      createdAt: new Date(),
    })
    .run();
}

// ---------------------------------------------------------------------------
// getLatestWeeklyReview
// ---------------------------------------------------------------------------

/**
 * Parses and returns the most recently saved weekly review, or null if none exist.
 */
export function getLatestWeeklyReview(): WeeklySummary | null {
  const db = getDb();

  const row = db
    .select()
    .from(weeklyReviews)
    .orderBy(desc(weeklyReviews.createdAt))
    .limit(1)
    .get();

  if (!row) return null;

  try {
    const parsed = JSON.parse(row.summaryJson) as WeeklySummary & {
      weekStart: string | Date;
      weekEnd: string | Date;
    };
    // Rehydrate Date fields that may have been serialised as ISO strings.
    parsed.weekStart = new Date(parsed.weekStart);
    parsed.weekEnd = new Date(parsed.weekEnd);
    return parsed as WeeklySummary;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// listWeeklyReviews
// ---------------------------------------------------------------------------

/**
 * Returns a lightweight list of all saved weekly reviews (id, weekLabel,
 * weekStart, createdAt), ordered most-recent first.
 */
export function listWeeklyReviews(): Array<{
  id: number;
  weekLabel: string;
  weekStart: Date;
  createdAt: Date;
}> {
  const db = getDb();

  const rows = db
    .select()
    .from(weeklyReviews)
    .orderBy(desc(weeklyReviews.createdAt))
    .all();

  return rows.map((row) => {
    let weekLabel = '';
    try {
      const parsed = JSON.parse(row.summaryJson) as { weekLabel?: string };
      weekLabel = parsed.weekLabel ?? formatWeekLabel(row.weekStart, row.weekEnd);
    } catch {
      weekLabel = formatWeekLabel(row.weekStart, row.weekEnd);
    }

    return {
      id: row.id,
      weekLabel,
      weekStart: row.weekStart instanceof Date ? row.weekStart : new Date(row.weekStart as number),
      createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt as number),
    };
  });
}
