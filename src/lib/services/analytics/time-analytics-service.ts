import { getDb } from '@/db';
import {
  applications,
  applicationTimeline,
  applicationReminders,
  applicationNotes,
} from '@/db/schema';
import {
  eq,
  and,
  lt,
  isNotNull,
  isNull,
  inArray,
  sql,
} from 'drizzle-orm';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LatencyStats {
  avgDays: number | null;
  medianDaysToApply: number | null;
  minDays: number | null;
  maxDays: number | null;
  sampleSize: number;
}

export interface StatusDuration {
  status: string;
  avgDays: number | null;
  sampleSize: number;
}

export interface StaleOpportunity {
  applicationId: number;
  title: string;
  company: string;
  savedAt: Date;
  tierSnapshot: string | null;
  daysStale: number;
}

export interface TimeSummary {
  avgDaysToApply: number | null;
  medianDaysToApply: number | null;
  staleOpportunityCount: number;
  dropOffCount: number;
  interviewsWithoutPrepCount: number;
  pendingFollowUps: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert a Date | null field (which drizzle returns as Date objects for
 *  timestamp columns) to a plain millisecond timestamp, safely. */
function toMs(val: Date | number | null | undefined): number | null {
  if (val === null || val === undefined) return null;
  if (val instanceof Date) return val.getTime();
  return val;
}

function msTodays(ms: number): number {
  return ms / 86_400_000;
}

function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

// ─── getApplyLatencyStats ─────────────────────────────────────────────────────

export function getApplyLatencyStats(): LatencyStats {
  const db = getDb();

  const rows = db
    .select({
      savedAt: applications.savedAt,
      appliedAt: applications.appliedAt,
    })
    .from(applications)
    .where(isNotNull(applications.appliedAt))
    .all();

  if (rows.length === 0) {
    return { avgDays: null, medianDaysToApply: null, minDays: null, maxDays: null, sampleSize: 0 };
  }

  const deltas: number[] = [];
  for (const row of rows) {
    const savedMs = toMs(row.savedAt);
    const appliedMs = toMs(row.appliedAt);
    if (savedMs !== null && appliedMs !== null && appliedMs >= savedMs) {
      deltas.push(msTodays(appliedMs - savedMs));
    }
  }

  if (deltas.length === 0) {
    return { avgDays: null, medianDaysToApply: null, minDays: null, maxDays: null, sampleSize: 0 };
  }

  deltas.sort((a, b) => a - b);

  const avgDays = deltas.reduce((s, v) => s + v, 0) / deltas.length;

  return {
    avgDays: Math.round(avgDays * 10) / 10,
    medianDaysToApply: Math.round((median(deltas) ?? 0) * 10) / 10,
    minDays: Math.round(deltas[0] * 10) / 10,
    maxDays: Math.round(deltas[deltas.length - 1] * 10) / 10,
    sampleSize: deltas.length,
  };
}

// ─── getStatusDurationStats ───────────────────────────────────────────────────

/**
 * For each status that has a lastStatusChangeAt, compute how long (in days)
 * applications have been in that status (open-ended — measured from
 * lastStatusChangeAt to now).  Only current status rows are measured.
 */
export function getStatusDurationStats(): StatusDuration[] {
  const db = getDb();

  const rows = db
    .select({
      status: applications.status,
      lastStatusChangeAt: applications.lastStatusChangeAt,
    })
    .from(applications)
    .where(isNotNull(applications.lastStatusChangeAt))
    .all();

  if (rows.length === 0) return [];

  const now = Date.now();
  const byStatus: Record<string, number[]> = {};

  for (const row of rows) {
    const changedMs = toMs(row.lastStatusChangeAt);
    if (changedMs === null) continue;
    const days = msTodays(now - changedMs);
    if (!byStatus[row.status]) byStatus[row.status] = [];
    byStatus[row.status].push(days);
  }

  return Object.entries(byStatus).map(([status, vals]) => ({
    status,
    avgDays: vals.length > 0
      ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10
      : null,
    sampleSize: vals.length,
  }));
}

// ─── getStaleOpportunities ────────────────────────────────────────────────────

export function getStaleOpportunities(staleDays: number = 7): StaleOpportunity[] {
  const db = getDb();

  const cutoff = new Date(Date.now() - staleDays * 86_400_000);

  const rows = db
    .select({
      id: applications.id,
      title: applications.title,
      company: applications.company,
      savedAt: applications.savedAt,
      tierSnapshot: applications.tierSnapshot,
    })
    .from(applications)
    .where(
      and(
        eq(applications.status, 'saved'),
        lt(applications.savedAt, cutoff),
        inArray(applications.tierSnapshot as Parameters<typeof inArray>[0], ['A', 'B']),
      ),
    )
    .all();

  const now = Date.now();
  return rows.map((r) => {
    const savedMs = toMs(r.savedAt) ?? now;
    return {
      applicationId: r.id,
      title: r.title,
      company: r.company,
      savedAt: r.savedAt,
      tierSnapshot: r.tierSnapshot ?? null,
      daysStale: Math.floor(msTodays(now - savedMs)),
    };
  });
}

// ─── getDropOffCount ──────────────────────────────────────────────────────────

/**
 * Applications that were saved more than 14 days ago and never progressed
 * past 'saved' status — considered drop-offs.
 */
export function getDropOffCount(): number {
  const db = getDb();

  const cutoff = new Date(Date.now() - 14 * 86_400_000);

  const row = db
    .select({ cnt: sql<number>`count(*)` })
    .from(applications)
    .where(
      and(
        eq(applications.status, 'saved'),
        lt(applications.savedAt, cutoff),
      ),
    )
    .get();

  return row?.cnt ?? 0;
}

// ─── getInterviewsWithoutPrepCount ────────────────────────────────────────────

/**
 * Count applications in interview stages that have zero notes with
 * category='interview'.  This is a proxy for "no interview prep done."
 */
export function getInterviewsWithoutPrepCount(): number {
  const db = getDb();

  // Applications currently in an interview stage
  const interviewApps = db
    .select({ id: applications.id })
    .from(applications)
    .where(
      inArray(applications.status, ['interview_scheduled', 'interviewed']),
    )
    .all();

  if (interviewApps.length === 0) return 0;

  const appIds = interviewApps.map((r) => r.id);

  // IDs that DO have an interview prep note
  const preppedRows = db
    .select({ applicationId: applicationNotes.applicationId })
    .from(applicationNotes)
    .where(
      and(
        inArray(applicationNotes.applicationId, appIds),
        eq(applicationNotes.category, 'interview'),
      ),
    )
    .all();

  const preppedSet = new Set(preppedRows.map((r) => r.applicationId));
  return appIds.filter((id) => !preppedSet.has(id)).length;
}

// ─── getTimeSummary ───────────────────────────────────────────────────────────

export function getTimeSummary(): TimeSummary {
  const db = getDb();

  const latency = getApplyLatencyStats();

  const staleOpportunityCount = getStaleOpportunities(7).length;
  const dropOffCount = getDropOffCount();
  const interviewsWithoutPrepCount = getInterviewsWithoutPrepCount();

  // Pending follow-up reminders: not completed and due before now
  const now = new Date();
  const pendingRow = db
    .select({ cnt: sql<number>`count(*)` })
    .from(applicationReminders)
    .where(
      and(
        eq(applicationReminders.isCompleted, false),
        lt(applicationReminders.dueAt, now),
      ),
    )
    .get();
  const pendingFollowUps = pendingRow?.cnt ?? 0;

  return {
    avgDaysToApply: latency.avgDays,
    medianDaysToApply: latency.medianDaysToApply,
    staleOpportunityCount,
    dropOffCount,
    interviewsWithoutPrepCount,
    pendingFollowUps,
  };
}
