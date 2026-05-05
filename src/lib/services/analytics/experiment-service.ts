/**
 * Phase J — Experiment Service
 *
 * Creates, updates, links, and queries A/B-style job search experiments.
 * All DB operations are synchronous (better-sqlite3).
 */

import { getDb } from '@/db';
import {
  experiments,
  experimentLinks,
  applications,
} from '@/db/schema';
import { eq, and, sql, inArray } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Experiment = typeof experiments.$inferSelect;

type ExperimentWithCounts = Experiment & {
  linkedApplications: number;
  linkedJobs: number;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Fetches linked-entity counts for one or more experiment IDs.
 * Returns a map keyed by experimentId.
 */
function fetchLinkCounts(
  db: ReturnType<typeof getDb>,
  experimentIds: number[],
): Map<number, { linkedApplications: number; linkedJobs: number }> {
  const result = new Map<number, { linkedApplications: number; linkedJobs: number }>();

  if (experimentIds.length === 0) return result;

  const rows = db
    .select({
      experimentId: experimentLinks.experimentId,
      linkedApplications: sql<number>`count(${experimentLinks.applicationId})`.as('linked_applications'),
      linkedJobs: sql<number>`count(${experimentLinks.scoredJobId})`.as('linked_jobs'),
    })
    .from(experimentLinks)
    .where(inArray(experimentLinks.experimentId, experimentIds))
    .groupBy(experimentLinks.experimentId)
    .all();

  for (const row of rows) {
    result.set(row.experimentId, {
      linkedApplications: Number(row.linkedApplications),
      linkedJobs: Number(row.linkedJobs),
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// createExperiment
// ---------------------------------------------------------------------------

export function createExperiment(input: {
  name: string;
  hypothesis: string;
  affectedCriteria?: Record<string, unknown>;
}): Experiment {
  const db = getDb();
  const now = new Date();

  db.insert(experiments)
    .values({
      name: input.name,
      hypothesis: input.hypothesis,
      status: 'running',
      startedAt: now,
      endedAt: null,
      affectedCriteria: input.affectedCriteria
        ? JSON.stringify(input.affectedCriteria)
        : null,
      metricsJson: null,
      conclusion: null,
      createdAt: now,
    })
    .run();

  const created = db
    .select()
    .from(experiments)
    .where(eq(experiments.name, input.name))
    .get();

  if (!created) {
    throw new Error(`Failed to create experiment "${input.name}"`);
  }

  return created;
}

// ---------------------------------------------------------------------------
// updateExperiment
// ---------------------------------------------------------------------------

export function updateExperiment(
  id: number,
  updates: {
    status?: string;
    endedAt?: Date;
    metricsJson?: Record<string, unknown>;
    conclusion?: string;
  },
): Experiment {
  const db = getDb();

  const patch: Partial<typeof experiments.$inferInsert> = {};

  if (updates.status !== undefined) {
    patch.status = updates.status;
  }
  if (updates.endedAt !== undefined) {
    patch.endedAt = updates.endedAt;
  }
  if (updates.metricsJson !== undefined) {
    patch.metricsJson = JSON.stringify(updates.metricsJson);
  }
  if (updates.conclusion !== undefined) {
    patch.conclusion = updates.conclusion;
  }

  if (Object.keys(patch).length > 0) {
    db.update(experiments).set(patch).where(eq(experiments.id, id)).run();
  }

  const updated = db
    .select()
    .from(experiments)
    .where(eq(experiments.id, id))
    .get();

  if (!updated) {
    throw new Error(`Experiment with id ${id} not found`);
  }

  return updated;
}

// ---------------------------------------------------------------------------
// linkToExperiment
// ---------------------------------------------------------------------------

export function linkToExperiment(opts: {
  experimentId: number;
  applicationId?: number;
  scoredJobId?: number;
}): void {
  const db = getDb();

  db.insert(experimentLinks)
    .values({
      experimentId: opts.experimentId,
      applicationId: opts.applicationId ?? null,
      scoredJobId: opts.scoredJobId ?? null,
      linkedAt: new Date(),
    })
    .run();
}

// ---------------------------------------------------------------------------
// getExperiment
// ---------------------------------------------------------------------------

export function getExperiment(
  id: number,
): ExperimentWithCounts | null {
  const db = getDb();

  const row = db
    .select()
    .from(experiments)
    .where(eq(experiments.id, id))
    .get();

  if (!row) return null;

  const counts = fetchLinkCounts(db, [id]);
  const c = counts.get(id) ?? { linkedApplications: 0, linkedJobs: 0 };

  return { ...row, ...c };
}

// ---------------------------------------------------------------------------
// listExperiments
// ---------------------------------------------------------------------------

export function listExperiments(): ExperimentWithCounts[] {
  const db = getDb();

  const rows = db.select().from(experiments).all();

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const counts = fetchLinkCounts(db, ids);

  return rows.map((row) => {
    const c = counts.get(row.id) ?? { linkedApplications: 0, linkedJobs: 0 };
    return { ...row, ...c };
  });
}

// ---------------------------------------------------------------------------
// computeExperimentMetrics
// ---------------------------------------------------------------------------

/**
 * For the given experiment, collects all linked applicationIds, then counts
 * those applications grouped by status. Returns a map of status -> count,
 * plus a 'total' key for the grand total.
 */
export function computeExperimentMetrics(id: number): Record<string, number> {
  const db = getDb();

  // Fetch all links for this experiment that have an applicationId.
  const links = db
    .select({ applicationId: experimentLinks.applicationId })
    .from(experimentLinks)
    .where(
      and(
        eq(experimentLinks.experimentId, id),
        sql`${experimentLinks.applicationId} IS NOT NULL`,
      ),
    )
    .all();

  const applicationIds = links
    .map((l) => l.applicationId)
    .filter((aid): aid is number => aid !== null);

  if (applicationIds.length === 0) {
    return { total: 0 };
  }

  const statusRows = db
    .select({
      status: applications.status,
      count: sql<number>`count(*)`.as('count'),
    })
    .from(applications)
    .where(inArray(applications.id, applicationIds))
    .groupBy(applications.status)
    .all();

  const metrics: Record<string, number> = { total: applicationIds.length };

  for (const row of statusRows) {
    metrics[row.status] = Number(row.count);
  }

  return metrics;
}
