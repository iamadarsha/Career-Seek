/**
 * Phase J — Funnel Service
 *
 * Computes application pipeline funnel stages from operational tables.
 * All DB operations are synchronous (better-sqlite3).
 */

import { getDb } from '@/db';
import {
  normalizedJobs,
  scoredJobs,
  applications,
} from '@/db/schema';
import {
  eq,
  and,
  gte,
  lte,
  sql,
  isNotNull,
  inArray,
  count,
} from 'drizzle-orm';
import { isValidationJob } from '@/lib/services/documents/asset-filters';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FunnelStage {
  stage: string;
  label: string;
  count: number;
  conversionFromPrev: number | null;
}

export interface FunnelBreakdown {
  dimension: string;
  value: string;
  stages: FunnelStage[];
}

// ---------------------------------------------------------------------------
// Internal — status sets
// ---------------------------------------------------------------------------

const PREPARED_STATUSES = [
  'preparing',
  'applied',
  'follow_up_due',
  'recruiter_replied',
  'interview_scheduled',
  'interviewed',
  'assessment',
  'offer',
] as const;

const APPLIED_STATUSES = [
  'applied',
  'follow_up_due',
  'recruiter_replied',
  'interview_scheduled',
  'interviewed',
  'assessment',
  'offer',
  'rejected',
] as const;

const RECRUITER_REPLIED_STATUSES = [
  'recruiter_replied',
  'interview_scheduled',
  'interviewed',
  'assessment',
  'offer',
] as const;

const INTERVIEW_STATUSES = [
  'interview_scheduled',
  'interviewed',
  'assessment',
  'offer',
] as const;

// ---------------------------------------------------------------------------
// Internal — compute stage counts from raw numbers
// ---------------------------------------------------------------------------

interface StageCounts {
  discovered: number;
  scored: number;
  saved: number;
  prepared: number;
  applied: number;
  recruiter_replied: number;
  interview: number;
  offer: number;
}

function buildFunnelStages(counts: StageCounts): FunnelStage[] {
  const ordered: Array<{ stage: string; label: string; value: number }> = [
    { stage: 'discovered', label: 'Discovered', value: counts.discovered },
    { stage: 'scored', label: 'Scored', value: counts.scored },
    { stage: 'saved', label: 'Saved', value: counts.saved },
    { stage: 'prepared', label: 'Prepared', value: counts.prepared },
    { stage: 'applied', label: 'Applied', value: counts.applied },
    { stage: 'recruiter_replied', label: 'Recruiter Replied', value: counts.recruiter_replied },
    { stage: 'interview', label: 'Interview', value: counts.interview },
    { stage: 'offer', label: 'Offer', value: counts.offer },
  ];

  return ordered.map((item, idx) => {
    const prev = idx > 0 ? ordered[idx - 1].value : null;
    let conversionFromPrev: number | null = null;
    if (prev !== null && prev > 0) {
      conversionFromPrev = Math.round((item.value / prev) * 1000) / 10; // 1 decimal
    } else if (prev === 0) {
      conversionFromPrev = null;
    }
    return {
      stage: item.stage,
      label: item.label,
      count: item.value,
      conversionFromPrev,
    };
  });
}

// ---------------------------------------------------------------------------
// computeOverallFunnel
// ---------------------------------------------------------------------------

export function computeOverallFunnel(): FunnelStage[] {
  const db = getDb();

  const discovered = db.select({
    portal: normalizedJobs.portal,
    title: normalizedJobs.title,
    company: normalizedJobs.company,
  }).from(normalizedJobs).all().filter((job) => !isValidationJob(job)).length;

  const scored = db.select({
    portal: normalizedJobs.portal,
    title: normalizedJobs.title,
    company: normalizedJobs.company,
  })
    .from(scoredJobs)
    .leftJoin(normalizedJobs, eq(scoredJobs.normalizedJobId, normalizedJobs.id))
    .all()
    .filter((row) => !isValidationJob(row)).length;

  const visibleApplications = db.select().from(applications).all().filter((app) => !isValidationJob(app));
  const saved = visibleApplications.length;
  const prepared = visibleApplications.filter((app) => PREPARED_STATUSES.includes(app.status as any)).length;
  const appliedFinal = visibleApplications.filter((app) => app.appliedAt || APPLIED_STATUSES.includes(app.status as any)).length;
  const recruiterReplied = visibleApplications.filter((app) => RECRUITER_REPLIED_STATUSES.includes(app.status as any)).length;
  const interview = visibleApplications.filter((app) => INTERVIEW_STATUSES.includes(app.status as any)).length;
  const offer = visibleApplications.filter((app) => app.status === 'offer').length;

  return buildFunnelStages({
    discovered,
    scored,
    saved,
    prepared,
    applied: appliedFinal,
    recruiter_replied: recruiterReplied,
    interview,
    offer,
  });
}

// ---------------------------------------------------------------------------
// computeFunnelByDimension
// ---------------------------------------------------------------------------

export function computeFunnelByDimension(
  dimension: 'portal' | 'tier',
): FunnelBreakdown[] {
  const db = getDb();

  if (dimension === 'portal') {
    // Get distinct portals from normalizedJobs
    const portals = db
      .selectDistinct({ portal: normalizedJobs.portal })
      .from(normalizedJobs)
      .all()
      .map((r) => r.portal)
      .filter((p): p is string => p !== null && p !== undefined);

    return portals.map((portal) => {
      const discovered = Number(
        db
          .select({ c: count() })
          .from(normalizedJobs)
          .where(eq(normalizedJobs.portal, portal))
          .get()?.c ?? 0,
      );

      const scored = Number(
        db
          .select({ c: count() })
          .from(scoredJobs)
          .leftJoin(normalizedJobs, eq(scoredJobs.normalizedJobId, normalizedJobs.id))
          .where(eq(normalizedJobs.portal, portal))
          .get()?.c ?? 0,
      );

      const saved = Number(
        db
          .select({ c: count() })
          .from(applications)
          .where(eq(applications.portal, portal))
          .get()?.c ?? 0,
      );

      const prepared = Number(
        db
          .select({ c: count() })
          .from(applications)
          .where(
            and(
              eq(applications.portal, portal),
              inArray(applications.status, [...PREPARED_STATUSES]),
            ),
          )
          .get()?.c ?? 0,
      );

      const applied = Number(
        db
          .select({ c: sql<number>`count(distinct ${applications.id})` })
          .from(applications)
          .where(
            and(
              eq(applications.portal, portal),
              sql`(${applications.appliedAt} IS NOT NULL OR ${applications.status} IN (${APPLIED_STATUSES.map(() => '?').join(',')}))`,
            ),
          )
          .get()?.c ?? 0,
      );

      const recruiterReplied = Number(
        db
          .select({ c: count() })
          .from(applications)
          .where(
            and(
              eq(applications.portal, portal),
              inArray(applications.status, [...RECRUITER_REPLIED_STATUSES]),
            ),
          )
          .get()?.c ?? 0,
      );

      const interview = Number(
        db
          .select({ c: count() })
          .from(applications)
          .where(
            and(
              eq(applications.portal, portal),
              inArray(applications.status, [...INTERVIEW_STATUSES]),
            ),
          )
          .get()?.c ?? 0,
      );

      const offer = Number(
        db
          .select({ c: count() })
          .from(applications)
          .where(and(eq(applications.portal, portal), eq(applications.status, 'offer')))
          .get()?.c ?? 0,
      );

      return {
        dimension: 'portal',
        value: portal,
        stages: buildFunnelStages({
          discovered,
          scored,
          saved,
          prepared,
          applied,
          recruiter_replied: recruiterReplied,
          interview,
          offer,
        }),
      };
    });
  }

  // dimension === 'tier'
  const tiers = ['A', 'B', 'C', 'D'];

  return tiers.map((tier) => {
    // discovered: normalizedJobs that have a scoredJob with this tier
    const discovered = Number(
      db
        .select({ c: sql<number>`count(distinct ${normalizedJobs.id})` })
        .from(normalizedJobs)
        .leftJoin(scoredJobs, eq(scoredJobs.normalizedJobId, normalizedJobs.id))
        .where(eq(scoredJobs.tier, tier))
        .get()?.c ?? 0,
    );

    const scored = Number(
      db
        .select({ c: count() })
        .from(scoredJobs)
        .where(eq(scoredJobs.tier, tier))
        .get()?.c ?? 0,
    );

    const saved = Number(
      db
        .select({ c: count() })
        .from(applications)
        .where(eq(applications.tierSnapshot, tier))
        .get()?.c ?? 0,
    );

    const prepared = Number(
      db
        .select({ c: count() })
        .from(applications)
        .where(
          and(
            eq(applications.tierSnapshot, tier),
            inArray(applications.status, [...PREPARED_STATUSES]),
          ),
        )
        .get()?.c ?? 0,
    );

    const applied = Number(
      db
        .select({ c: sql<number>`count(distinct ${applications.id})` })
        .from(applications)
        .where(
          and(
            eq(applications.tierSnapshot, tier),
            sql`(${applications.appliedAt} IS NOT NULL OR ${applications.status} IN (${APPLIED_STATUSES.map(() => '?').join(',')}))`,
          ),
        )
        .get()?.c ?? 0,
    );

    const recruiterReplied = Number(
      db
        .select({ c: count() })
        .from(applications)
        .where(
          and(
            eq(applications.tierSnapshot, tier),
            inArray(applications.status, [...RECRUITER_REPLIED_STATUSES]),
          ),
        )
        .get()?.c ?? 0,
    );

    const interview = Number(
      db
        .select({ c: count() })
        .from(applications)
        .where(
          and(
            eq(applications.tierSnapshot, tier),
            inArray(applications.status, [...INTERVIEW_STATUSES]),
          ),
        )
        .get()?.c ?? 0,
    );

    const offer = Number(
      db
        .select({ c: count() })
        .from(applications)
        .where(and(eq(applications.tierSnapshot, tier), eq(applications.status, 'offer')))
        .get()?.c ?? 0,
    );

    return {
      dimension: 'tier',
      value: tier,
      stages: buildFunnelStages({
        discovered,
        scored,
        saved,
        prepared,
        applied,
        recruiter_replied: recruiterReplied,
        interview,
        offer,
      }),
    };
  });
}

// ---------------------------------------------------------------------------
// computeFunnelForPeriod
// ---------------------------------------------------------------------------

/**
 * Computes funnel stages constrained to jobs/applications created within
 * the given time window. Uses scrapedAt for normalizedJobs, scoredAt for
 * scoredJobs, and savedAt/appliedAt for applications.
 */
export function computeFunnelForPeriod(since: Date, until: Date): FunnelStage[] {
  const db = getDb();

  const discovered = Number(
    db
      .select({ c: count() })
      .from(normalizedJobs)
      .where(
        and(
          gte(normalizedJobs.scrapedAt, since),
          lte(normalizedJobs.scrapedAt, until),
        ),
      )
      .get()?.c ?? 0,
  );

  const scored = Number(
    db
      .select({ c: count() })
      .from(scoredJobs)
      .where(
        and(
          gte(scoredJobs.scoredAt, since),
          lte(scoredJobs.scoredAt, until),
        ),
      )
      .get()?.c ?? 0,
  );

  const saved = Number(
    db
      .select({ c: count() })
      .from(applications)
      .where(
        and(
          gte(applications.savedAt, since),
          lte(applications.savedAt, until),
        ),
      )
      .get()?.c ?? 0,
  );

  const prepared = Number(
    db
      .select({ c: count() })
      .from(applications)
      .where(
        and(
          gte(applications.savedAt, since),
          lte(applications.savedAt, until),
          inArray(applications.status, [...PREPARED_STATUSES]),
        ),
      )
      .get()?.c ?? 0,
  );

  const applied = Number(
    db
      .select({ c: sql<number>`count(distinct ${applications.id})` })
      .from(applications)
      .where(
        and(
          gte(applications.savedAt, since),
          lte(applications.savedAt, until),
          sql`(${applications.appliedAt} IS NOT NULL OR ${applications.status} IN (${APPLIED_STATUSES.map(() => '?').join(',')}))`,
        ),
      )
      .get()?.c ?? 0,
  );

  const recruiterReplied = Number(
    db
      .select({ c: count() })
      .from(applications)
      .where(
        and(
          gte(applications.savedAt, since),
          lte(applications.savedAt, until),
          inArray(applications.status, [...RECRUITER_REPLIED_STATUSES]),
        ),
      )
      .get()?.c ?? 0,
  );

  const interview = Number(
    db
      .select({ c: count() })
      .from(applications)
      .where(
        and(
          gte(applications.savedAt, since),
          lte(applications.savedAt, until),
          inArray(applications.status, [...INTERVIEW_STATUSES]),
        ),
      )
      .get()?.c ?? 0,
  );

  const offer = Number(
    db
      .select({ c: count() })
      .from(applications)
      .where(
        and(
          gte(applications.savedAt, since),
          lte(applications.savedAt, until),
          eq(applications.status, 'offer'),
        ),
      )
      .get()?.c ?? 0,
  );

  return buildFunnelStages({
    discovered,
    scored,
    saved,
    prepared,
    applied,
    recruiter_replied: recruiterReplied,
    interview,
    offer,
  });
}
