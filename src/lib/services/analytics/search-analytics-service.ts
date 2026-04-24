/**
 * Phase J — Search Analytics Service
 *
 * Computes portal performance, search profile performance, top locations,
 * and a high-level search summary. All DB operations are synchronous (better-sqlite3).
 */

import { getDb } from '@/db';
import {
  normalizedJobs,
  scoredJobs,
  applications,
  searchProfiles,
  scans,
} from '@/db/schema';
import {
  eq,
  and,
  sql,
  count,
  avg,
  desc,
  isNotNull,
  inArray,
} from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PortalPerformance {
  portal: string;
  totalDiscovered: number;
  totalScored: number;
  tierACount: number;
  tierBCount: number;
  avgScore: number | null;
  applicationCount: number;
  tierARate: number | null;   // (tierACount / totalScored) * 100, 1 decimal
  applyRate: number | null;   // (applicationCount / totalDiscovered) * 100, 1 decimal
}

export interface SearchProfilePerformance {
  searchProfileId: number;
  title: string;
  totalScored: number;
  tierACount: number;
  tierBCount: number;
  avgScore: number | null;
  applicationCount: number;
  scanCount: number;
  tierARate: number | null;
  applyRate: number | null;
}

export interface LocationPerformance {
  location: string | null;
  isRemote: boolean;
  totalDiscovered: number;
  totalScored: number;
  applicationCount: number;
  applyRate: number | null;
}

export interface SearchSummary {
  totalPortals: number;
  bestPortal: string | null;
  bestSearchProfile: string | null;
  totalDiscovered: number;
  tierADensity: number | null; // (totalTierA / totalScored) * 100, 1 decimal
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function rate(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

// ---------------------------------------------------------------------------
// getPortalPerformance
// ---------------------------------------------------------------------------

/**
 * Groups scoredJobs (joined to normalizedJobs) by portal, computes tier
 * distribution, avg score, and links to applications via scoredJobId.
 */
export function getPortalPerformance(): PortalPerformance[] {
  const db = getDb();

  // Discovered per portal (from normalizedJobs)
  const discoveredByPortal = db
    .select({
      portal: normalizedJobs.portal,
      totalDiscovered: sql<number>`count(*)`.as('total_discovered'),
    })
    .from(normalizedJobs)
    .groupBy(normalizedJobs.portal)
    .all();

  const discoveredMap = new Map<string, number>();
  for (const row of discoveredByPortal) {
    discoveredMap.set(row.portal, Number(row.totalDiscovered));
  }

  // Scored metrics per portal
  const scoredByPortal = db
    .select({
      portal: normalizedJobs.portal,
      totalScored: sql<number>`count(*)`.as('total_scored'),
      tierACount: sql<number>`sum(case when ${scoredJobs.tier} = 'A' then 1 else 0 end)`.as('tier_a'),
      tierBCount: sql<number>`sum(case when ${scoredJobs.tier} = 'B' then 1 else 0 end)`.as('tier_b'),
      avgScore: sql<number>`round(avg(${scoredJobs.score}), 1)`.as('avg_score'),
    })
    .from(scoredJobs)
    .leftJoin(normalizedJobs, eq(scoredJobs.normalizedJobId, normalizedJobs.id))
    .groupBy(normalizedJobs.portal)
    .all();

  // Application counts per portal (via applications.portal denormalized field)
  const appsByPortal = db
    .select({
      portal: applications.portal,
      applicationCount: sql<number>`count(*)`.as('app_count'),
    })
    .from(applications)
    .where(isNotNull(applications.portal))
    .groupBy(applications.portal)
    .all();

  const appsMap = new Map<string, number>();
  for (const row of appsByPortal) {
    if (row.portal) {
      appsMap.set(row.portal, Number(row.applicationCount));
    }
  }

  return scoredByPortal.map((row) => {
    const portal = row.portal ?? 'unknown';
    const totalDiscovered = discoveredMap.get(portal) ?? 0;
    const totalScored = Number(row.totalScored);
    const tierACount = Number(row.tierACount ?? 0);
    const tierBCount = Number(row.tierBCount ?? 0);
    const avgScore = row.avgScore !== null && row.avgScore !== undefined
      ? Number(row.avgScore)
      : null;
    const applicationCount = appsMap.get(portal) ?? 0;

    return {
      portal,
      totalDiscovered,
      totalScored,
      tierACount,
      tierBCount,
      avgScore,
      applicationCount,
      tierARate: rate(tierACount, totalScored),
      applyRate: rate(applicationCount, totalDiscovered),
    };
  });
}

// ---------------------------------------------------------------------------
// getSearchProfilePerformance
// ---------------------------------------------------------------------------

/**
 * Groups scoredJobs by searchProfileId, joins searchProfiles for the title,
 * counts scans per profile, and links applications via applications.scoredJobId.
 */
export function getSearchProfilePerformance(): SearchProfilePerformance[] {
  const db = getDb();

  // Scored metrics per search profile
  const scoredByProfile = db
    .select({
      searchProfileId: scoredJobs.searchProfileId,
      totalScored: sql<number>`count(*)`.as('total_scored'),
      tierACount: sql<number>`sum(case when ${scoredJobs.tier} = 'A' then 1 else 0 end)`.as('tier_a'),
      tierBCount: sql<number>`sum(case when ${scoredJobs.tier} = 'B' then 1 else 0 end)`.as('tier_b'),
      avgScore: sql<number>`round(avg(${scoredJobs.score}), 1)`.as('avg_score'),
    })
    .from(scoredJobs)
    .groupBy(scoredJobs.searchProfileId)
    .all();

  if (scoredByProfile.length === 0) return [];

  // Search profile titles
  const profileIds = scoredByProfile.map((r) => r.searchProfileId);
  const profileRows = db
    .select({ id: searchProfiles.id, title: searchProfiles.title })
    .from(searchProfiles)
    .where(inArray(searchProfiles.id, profileIds))
    .all();

  const profileTitleMap = new Map<number, string>();
  for (const p of profileRows) {
    profileTitleMap.set(p.id, p.title);
  }

  // Scan counts per search profile
  const scanCounts = db
    .select({
      searchProfileId: scans.searchProfileId,
      scanCount: sql<number>`count(*)`.as('scan_count'),
    })
    .from(scans)
    .where(isNotNull(scans.searchProfileId))
    .groupBy(scans.searchProfileId)
    .all();

  const scanCountMap = new Map<number, number>();
  for (const s of scanCounts) {
    if (s.searchProfileId !== null) {
      scanCountMap.set(s.searchProfileId, Number(s.scanCount));
    }
  }

  // Application counts per search profile — join via scoredJobs.searchProfileId
  // applications -> scoredJobs -> searchProfileId
  const appsByProfile = db
    .select({
      searchProfileId: scoredJobs.searchProfileId,
      applicationCount: sql<number>`count(distinct ${applications.id})`.as('app_count'),
    })
    .from(applications)
    .leftJoin(scoredJobs, eq(applications.scoredJobId, scoredJobs.id))
    .where(isNotNull(scoredJobs.searchProfileId))
    .groupBy(scoredJobs.searchProfileId)
    .all();

  const appsMap = new Map<number, number>();
  for (const row of appsByProfile) {
    if (row.searchProfileId !== null) {
      appsMap.set(row.searchProfileId, Number(row.applicationCount));
    }
  }

  // Total discovered per search profile (from normalizedJobs)
  const discoveredByProfile = db
    .select({
      searchProfileId: normalizedJobs.searchProfileId,
      totalDiscovered: sql<number>`count(*)`.as('total_discovered'),
    })
    .from(normalizedJobs)
    .groupBy(normalizedJobs.searchProfileId)
    .all();

  const discoveredMap = new Map<number, number>();
  for (const row of discoveredByProfile) {
    discoveredMap.set(row.searchProfileId, Number(row.totalDiscovered));
  }

  return scoredByProfile.map((row) => {
    const totalScored = Number(row.totalScored);
    const tierACount = Number(row.tierACount ?? 0);
    const tierBCount = Number(row.tierBCount ?? 0);
    const avgScore = row.avgScore !== null && row.avgScore !== undefined
      ? Number(row.avgScore)
      : null;
    const applicationCount = appsMap.get(row.searchProfileId) ?? 0;
    const totalDiscovered = discoveredMap.get(row.searchProfileId) ?? 0;

    return {
      searchProfileId: row.searchProfileId,
      title: profileTitleMap.get(row.searchProfileId) ?? `Profile #${row.searchProfileId}`,
      totalScored,
      tierACount,
      tierBCount,
      avgScore,
      applicationCount,
      scanCount: scanCountMap.get(row.searchProfileId) ?? 0,
      tierARate: rate(tierACount, totalScored),
      applyRate: rate(applicationCount, totalDiscovered),
    };
  });
}

// ---------------------------------------------------------------------------
// getTopLocations
// ---------------------------------------------------------------------------

/**
 * Groups normalizedJobs by (location, isRemote), links application counts
 * via scoredJobs, returns sorted by totalDiscovered descending.
 */
export function getTopLocations(limit = 20): LocationPerformance[] {
  const db = getDb();

  // Discovered per (location, isRemote)
  const discoveredByLocation = db
    .select({
      location: normalizedJobs.location,
      isRemote: normalizedJobs.isRemote,
      totalDiscovered: sql<number>`count(*)`.as('total_discovered'),
    })
    .from(normalizedJobs)
    .groupBy(normalizedJobs.location, normalizedJobs.isRemote)
    .orderBy(desc(sql`total_discovered`))
    .limit(limit)
    .all();

  if (discoveredByLocation.length === 0) return [];

  // Scored per (location, isRemote) — join normalizedJobs through scoredJobs
  const scoredByLocation = db
    .select({
      location: normalizedJobs.location,
      isRemote: normalizedJobs.isRemote,
      totalScored: sql<number>`count(*)`.as('total_scored'),
    })
    .from(scoredJobs)
    .leftJoin(normalizedJobs, eq(scoredJobs.normalizedJobId, normalizedJobs.id))
    .groupBy(normalizedJobs.location, normalizedJobs.isRemote)
    .all();

  // Key: `${location}|${isRemote}`
  const scoredMap = new Map<string, number>();
  for (const row of scoredByLocation) {
    const key = `${row.location ?? ''}|${row.isRemote ? '1' : '0'}`;
    scoredMap.set(key, Number(row.totalScored));
  }

  // Applications per (location, isRemote) — via applications.location
  const appsByLocation = db
    .select({
      location: applications.location,
      applicationCount: sql<number>`count(*)`.as('app_count'),
    })
    .from(applications)
    .groupBy(applications.location)
    .all();

  const appsMap = new Map<string, number>();
  for (const row of appsByLocation) {
    appsMap.set(row.location ?? '', Number(row.applicationCount));
  }

  return discoveredByLocation.map((row) => {
    const location = row.location ?? null;
    const isRemote = Boolean(row.isRemote);
    const totalDiscovered = Number(row.totalDiscovered);
    const key = `${location ?? ''}|${isRemote ? '1' : '0'}`;
    const totalScored = scoredMap.get(key) ?? 0;
    const applicationCount = appsMap.get(location ?? '') ?? 0;

    return {
      location,
      isRemote,
      totalDiscovered,
      totalScored,
      applicationCount,
      applyRate: rate(applicationCount, totalDiscovered),
    };
  });
}

// ---------------------------------------------------------------------------
// getSearchSummary
// ---------------------------------------------------------------------------

export function getSearchSummary(): {
  totalPortals: number;
  bestPortal: string | null;
  bestSearchProfile: string | null;
  totalDiscovered: number;
  tierADensity: number | null;
} {
  const db = getDb();

  // Distinct portals from normalizedJobs
  const portalsRow = db
    .select({ c: sql<number>`count(distinct ${normalizedJobs.portal})` })
    .from(normalizedJobs)
    .get();
  const totalPortals = Number(portalsRow?.c ?? 0);

  // Total discovered
  const discoveredRow = db.select({ c: count() }).from(normalizedJobs).get();
  const totalDiscovered = Number(discoveredRow?.c ?? 0);

  // Tier A density across all scored jobs
  const tierStatsRow = db
    .select({
      totalScored: sql<number>`count(*)`,
      tierACount: sql<number>`sum(case when ${scoredJobs.tier} = 'A' then 1 else 0 end)`,
    })
    .from(scoredJobs)
    .get();
  const totalScored = Number(tierStatsRow?.totalScored ?? 0);
  const tierATotal = Number(tierStatsRow?.tierACount ?? 0);
  const tierADensity = rate(tierATotal, totalScored);

  // Best portal: highest application count
  const portalApps = db
    .select({
      portal: applications.portal,
      c: sql<number>`count(*)`,
    })
    .from(applications)
    .where(isNotNull(applications.portal))
    .groupBy(applications.portal)
    .orderBy(desc(sql`c`))
    .limit(1)
    .get();
  const bestPortal = portalApps?.portal ?? null;

  // Best search profile: highest tier A count
  const bestProfileRow = db
    .select({
      searchProfileId: scoredJobs.searchProfileId,
      tierACount: sql<number>`sum(case when ${scoredJobs.tier} = 'A' then 1 else 0 end)`.as('tier_a'),
    })
    .from(scoredJobs)
    .groupBy(scoredJobs.searchProfileId)
    .orderBy(desc(sql`tier_a`))
    .limit(1)
    .get();

  let bestSearchProfile: string | null = null;
  if (bestProfileRow) {
    const profileRow = db
      .select({ title: searchProfiles.title })
      .from(searchProfiles)
      .where(eq(searchProfiles.id, bestProfileRow.searchProfileId))
      .get();
    bestSearchProfile = profileRow?.title ?? null;
  }

  return {
    totalPortals,
    bestPortal,
    bestSearchProfile,
    totalDiscovered,
    tierADensity,
  };
}
