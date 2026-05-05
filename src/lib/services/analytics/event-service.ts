/**
 * Phase J — Analytics Event Service
 *
 * Handles logging, backfilling, and querying of analytics_events.
 * All DB operations are synchronous (better-sqlite3).
 */

import { getDb } from '@/db';
import {
  analyticsEvents,
  scoredJobs,
  normalizedJobs,
  applications,
  applicationTimeline,
  documentAssets,
  emailDrafts,
} from '@/db/schema';
import {
  eq,
  and,
  gte,
  lte,
  desc,
  sql,
  isNotNull,
  inArray,
} from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AnalyticsEvent {
  id: number;
  eventType: string;
  entityType: string | null;
  entityId: number | null;
  portal: string | null;
  tier: string | null;
  score: number | null;
  applicationStatus: string | null;
  metadata: string | null;
  occurredAt: Date;
}

export interface LogAnalyticsEventInput {
  eventType: string;
  entityType?: string;
  entityId?: number;
  portal?: string;
  tier?: string;
  score?: number;
  applicationStatus?: string;
  metadata?: Record<string, unknown>;
  occurredAt?: Date;
}

export interface EventQueryOptions {
  eventType?: string;
  entityType?: string;
  portal?: string;
  tier?: string;
  since?: Date;
  until?: Date;
  limit?: number;
  offset?: number;
}

// ---------------------------------------------------------------------------
// logAnalyticsEvent
// ---------------------------------------------------------------------------

/**
 * Logs a single analytics event immediately.
 */
export function logAnalyticsEvent(input: LogAnalyticsEventInput): void {
  const db = getDb();

  db.insert(analyticsEvents)
    .values({
      eventType: input.eventType,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      portal: input.portal ?? null,
      tier: input.tier ?? null,
      score: input.score ?? null,
      applicationStatus: input.applicationStatus ?? null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      occurredAt: input.occurredAt ?? new Date(),
    })
    .run();
}

// ---------------------------------------------------------------------------
// Internal dedup helper
// ---------------------------------------------------------------------------

/**
 * Returns true if an event with the same entityType + entityId + eventType
 * already exists in analyticsEvents.
 */
function eventExists(
  db: ReturnType<typeof getDb>,
  entityType: string,
  entityId: number,
  eventType: string,
): boolean {
  const row = db
    .select({ id: analyticsEvents.id })
    .from(analyticsEvents)
    .where(
      and(
        eq(analyticsEvents.entityType, entityType),
        eq(analyticsEvents.entityId, entityId),
        eq(analyticsEvents.eventType, eventType),
      ),
    )
    .get();

  return row !== undefined;
}

// ---------------------------------------------------------------------------
// backfillAnalyticsEvents
// ---------------------------------------------------------------------------

/**
 * Derives analytics events from existing operational tables and inserts them
 * into analyticsEvents. Idempotent — existing events are skipped.
 *
 * Derived event types:
 *   job_scored          ← scoredJobs
 *   application_created ← applications (savedAt)
 *   application_applied ← applications (appliedAt IS NOT NULL)
 *   interview_scheduled ← applicationTimeline (eventType = 'interview_scheduled')
 *   offer_received      ← applicationTimeline (eventType = 'offer_received')
 *   rejection_recorded  ← applicationTimeline (eventType = 'rejection_recorded')
 *   resume_generated    ← documentAssets (type = 'resume')
 *   draft_generated     ← emailDrafts
 */
export function backfillAnalyticsEvents(): { inserted: number; skipped: number } {
  const db = getDb();
  let inserted = 0;
  let skipped = 0;

  // ── 1. job_scored from scoredJobs ────────────────────────────────────────
  const allScoredJobs = db
    .select({
      id: scoredJobs.id,
      portal: normalizedJobs.portal,
      tier: scoredJobs.tier,
      score: scoredJobs.score,
      scoredAt: scoredJobs.scoredAt,
    })
    .from(scoredJobs)
    .leftJoin(normalizedJobs, eq(scoredJobs.normalizedJobId, normalizedJobs.id))
    .all();

  for (const row of allScoredJobs) {
    if (eventExists(db, 'scored_job', row.id, 'job_scored')) {
      skipped++;
      continue;
    }
    db.insert(analyticsEvents)
      .values({
        eventType: 'job_scored',
        entityType: 'scored_job',
        entityId: row.id,
        portal: row.portal ?? null,
        tier: row.tier,
        score: row.score,
        applicationStatus: null,
        metadata: null,
        occurredAt: row.scoredAt,
      })
      .run();
    inserted++;
  }

  // ── 2. application_created from applications.savedAt ─────────────────────
  const allApplications = db
    .select({
      id: applications.id,
      portal: applications.portal,
      tierSnapshot: applications.tierSnapshot,
      scoreSnapshot: applications.scoreSnapshot,
      status: applications.status,
      savedAt: applications.savedAt,
      appliedAt: applications.appliedAt,
    })
    .from(applications)
    .all();

  for (const row of allApplications) {
    // application_created
    if (!eventExists(db, 'application', row.id, 'application_created')) {
      db.insert(analyticsEvents)
        .values({
          eventType: 'application_created',
          entityType: 'application',
          entityId: row.id,
          portal: row.portal ?? null,
          tier: row.tierSnapshot ?? null,
          score: row.scoreSnapshot ?? null,
          applicationStatus: row.status,
          metadata: null,
          occurredAt: row.savedAt,
        })
        .run();
      inserted++;
    } else {
      skipped++;
    }

    // application_applied (only if appliedAt is set)
    if (row.appliedAt) {
      if (!eventExists(db, 'application', row.id, 'application_applied')) {
        db.insert(analyticsEvents)
          .values({
            eventType: 'application_applied',
            entityType: 'application',
            entityId: row.id,
            portal: row.portal ?? null,
            tier: row.tierSnapshot ?? null,
            score: row.scoreSnapshot ?? null,
            applicationStatus: row.status,
            metadata: null,
            occurredAt: row.appliedAt,
          })
          .run();
        inserted++;
      } else {
        skipped++;
      }
    }
  }

  // ── 3. Timeline-derived events ────────────────────────────────────────────
  const timelineEventTypes = [
    'interview_scheduled',
    'offer_received',
    'rejection_recorded',
  ] as const;

  const relevantTimelineRows = db
    .select({
      id: applicationTimeline.id,
      applicationId: applicationTimeline.applicationId,
      eventType: applicationTimeline.eventType,
      createdAt: applicationTimeline.createdAt,
    })
    .from(applicationTimeline)
    .where(inArray(applicationTimeline.eventType, [...timelineEventTypes]))
    .all();

  // Build a map of applicationId -> application metadata for denormalization
  const appMetaMap = new Map<
    number,
    { portal: string | null; tier: string | null; score: number | null; status: string }
  >();
  for (const a of allApplications) {
    appMetaMap.set(a.id, {
      portal: a.portal ?? null,
      tier: a.tierSnapshot ?? null,
      score: a.scoreSnapshot ?? null,
      status: a.status,
    });
  }

  for (const row of relevantTimelineRows) {
    // Use applicationTimeline row id as entityId with entityType 'application_timeline'
    // so the dedup key is unique per timeline entry
    if (eventExists(db, 'application_timeline', row.id, row.eventType)) {
      skipped++;
      continue;
    }
    const meta = appMetaMap.get(row.applicationId);
    db.insert(analyticsEvents)
      .values({
        eventType: row.eventType,
        entityType: 'application_timeline',
        entityId: row.id,
        portal: meta?.portal ?? null,
        tier: meta?.tier ?? null,
        score: meta?.score ?? null,
        applicationStatus: meta?.status ?? null,
        metadata: JSON.stringify({ applicationId: row.applicationId }),
        occurredAt: row.createdAt,
      })
      .run();
    inserted++;
  }

  // ── 4. resume_generated from documentAssets where type = 'resume' ─────────
  const resumeAssets = db
    .select({
      id: documentAssets.id,
      scoredJobId: documentAssets.scoredJobId,
      atsScore: documentAssets.atsScore,
      createdAt: documentAssets.createdAt,
    })
    .from(documentAssets)
    .where(eq(documentAssets.type, 'resume'))
    .all();

  // Build scoredJob -> portal/tier/score map
  const scoredJobMetaMap = new Map<
    number,
    { portal: string | null; tier: string; score: number }
  >();
  for (const sj of allScoredJobs) {
    scoredJobMetaMap.set(sj.id, {
      portal: sj.portal ?? null,
      tier: sj.tier,
      score: sj.score,
    });
  }

  for (const asset of resumeAssets) {
    if (eventExists(db, 'document_asset', asset.id, 'resume_generated')) {
      skipped++;
      continue;
    }
    const sjMeta = scoredJobMetaMap.get(asset.scoredJobId);
    db.insert(analyticsEvents)
      .values({
        eventType: 'resume_generated',
        entityType: 'document_asset',
        entityId: asset.id,
        portal: sjMeta?.portal ?? null,
        tier: sjMeta?.tier ?? null,
        score: sjMeta?.score ?? null,
        applicationStatus: null,
        metadata: JSON.stringify({ scoredJobId: asset.scoredJobId, atsScore: asset.atsScore }),
        occurredAt: asset.createdAt,
      })
      .run();
    inserted++;
  }

  // ── 5. draft_generated from emailDrafts ──────────────────────────────────
  const allEmailDrafts = db
    .select({
      id: emailDrafts.id,
      applicationId: emailDrafts.applicationId,
      draftType: emailDrafts.draftType,
      status: emailDrafts.status,
      createdAt: emailDrafts.createdAt,
    })
    .from(emailDrafts)
    .all();

  for (const draft of allEmailDrafts) {
    if (eventExists(db, 'email_draft', draft.id, 'draft_generated')) {
      skipped++;
      continue;
    }
    const appMeta = appMetaMap.get(draft.applicationId);
    db.insert(analyticsEvents)
      .values({
        eventType: 'draft_generated',
        entityType: 'email_draft',
        entityId: draft.id,
        portal: appMeta?.portal ?? null,
        tier: appMeta?.tier ?? null,
        score: appMeta?.score ?? null,
        applicationStatus: appMeta?.status ?? null,
        metadata: JSON.stringify({ applicationId: draft.applicationId, draftType: draft.draftType }),
        occurredAt: draft.createdAt,
      })
      .run();
    inserted++;
  }

  return { inserted, skipped };
}

// ---------------------------------------------------------------------------
// queryEvents
// ---------------------------------------------------------------------------

/**
 * Queries analytics events with optional filtering and pagination.
 */
export function queryEvents(opts: EventQueryOptions = {}): AnalyticsEvent[] {
  const db = getDb();

  const conditions = [];

  if (opts.eventType) {
    conditions.push(eq(analyticsEvents.eventType, opts.eventType));
  }
  if (opts.entityType) {
    conditions.push(eq(analyticsEvents.entityType, opts.entityType));
  }
  if (opts.portal) {
    conditions.push(eq(analyticsEvents.portal, opts.portal));
  }
  if (opts.tier) {
    conditions.push(eq(analyticsEvents.tier, opts.tier));
  }
  if (opts.since) {
    conditions.push(gte(analyticsEvents.occurredAt, opts.since));
  }
  if (opts.until) {
    conditions.push(lte(analyticsEvents.occurredAt, opts.until));
  }

  let query = db
    .select()
    .from(analyticsEvents)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(analyticsEvents.occurredAt));

  if (opts.limit !== undefined) {
    query = query.limit(opts.limit) as typeof query;
  }
  if (opts.offset !== undefined) {
    query = query.offset(opts.offset) as typeof query;
  }

  const rows = query.all();

  return rows.map((r) => ({
    id: r.id,
    eventType: r.eventType,
    entityType: r.entityType ?? null,
    entityId: r.entityId ?? null,
    portal: r.portal ?? null,
    tier: r.tier ?? null,
    score: r.score ?? null,
    applicationStatus: r.applicationStatus ?? null,
    metadata: r.metadata ?? null,
    occurredAt: r.occurredAt instanceof Date ? r.occurredAt : new Date(r.occurredAt as number),
  }));
}

// ---------------------------------------------------------------------------
// countEventsByType
// ---------------------------------------------------------------------------

/**
 * Returns a map of eventType -> count for all events in the optional period.
 */
export function countEventsByType(
  since?: Date,
  until?: Date,
): Record<string, number> {
  const db = getDb();

  const conditions = [];
  if (since) {
    conditions.push(gte(analyticsEvents.occurredAt, since));
  }
  if (until) {
    conditions.push(lte(analyticsEvents.occurredAt, until));
  }

  const rows = db
    .select({
      eventType: analyticsEvents.eventType,
      count: sql<number>`count(*)`.as('count'),
    })
    .from(analyticsEvents)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(analyticsEvents.eventType)
    .all();

  const result: Record<string, number> = {};
  for (const row of rows) {
    result[row.eventType] = Number(row.count);
  }
  return result;
}
