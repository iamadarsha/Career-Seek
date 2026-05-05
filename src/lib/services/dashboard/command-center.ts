import { getDb } from '../../../db';
import {
  applications,
  scoredJobs,
  normalizedJobs,
  jobEnrichments,
  scans,
  scanPortalRuns,
  platformJobs,
  searchProfiles,
  masterProfiles,
  documentAssets,
} from '../../../db/schema';
import { eq, and, desc, ne, notInArray, sql } from 'drizzle-orm';
import { resolveContext } from '@/lib/platform/identity';
import { SCORING_THRESHOLDS } from '../../constants/scoring';
import { getCrmDashboard } from '../crm/dashboard-crm';
import { getAppConfig } from '../../config';
import { getOnboardingGate, type OnboardingGate } from '../../onboarding/gate';
import { getSystemCapabilities, type CapabilityMatrix } from '../system/capabilities';

import { computeOverallFunnel, FunnelStage } from '../analytics/funnel-service';
import { buildSearchExpansionSuggestions } from '../search-preferences';
import { executeAiSearch } from '../scoring/ai-search';

function safeJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function isDisplayableJob(job?: {
  portal?: string | null;
  title?: string | null;
  company?: string | null;
  url?: string | null;
  applyUrl?: string | null;
}) {
  if (!job) return false;
  const portal = String(job.portal || '');
  const title = String(job.title || '').trim();
  const company = String(job.company || '').trim();
  const url = String(job.applyUrl || job.url || '');
  if (process.env.JOBHUNT_ENABLE_VALIDATION_SOURCE !== '1' && portal.startsWith('validation_')) return false;
  if (/\/undefined(?:$|[/?#])/i.test(url)) return false;
  if (/^foundit job$/i.test(title) && /^company not listed$/i.test(company)) return false;
  if (/<[^>]+>|src=|data-nimg|logo\.svg/i.test(title)) return false;
  return true;
}

function excludeNonDisplayableRows<T extends {
  portal?: string | null;
  title?: string | null;
  company?: string | null;
  url?: string | null;
  applyUrl?: string | null;
  normalizedJob?: {
    portal?: string | null;
    title?: string | null;
    company?: string | null;
    url?: string | null;
    applyUrl?: string | null;
  } | null;
}>(rows: T[]) {
  return rows.filter((row) => isDisplayableJob(row.normalizedJob || row));
}

export interface CommandCenterData {
  config: any;
  capabilities: CapabilityMatrix;
  onboardingGate: OnboardingGate;
  crm: any;
  priorityQueue: any[];
  latestJobs: any[];
  funnel: FunnelStage[];
  profileSummary: {
    name: string;
    headline: string;
    target: string;
  };
  stats: {
    actionableJobs: number;
    applyToday: number;
    applyIn3Days: number;
    totalScraped: number;
    portalsActive: number;
    averageScore: number;
  };
  systemStatus: {
    lastScan: string | null;
    isScanning: boolean;
    scanProgress: number;
    portalHealth: Array<{ portal: string, status: string, jobsFound: number, failureCode?: string, message?: string }>;
  };
  insights: {
    byPortal: Array<{ portal: string; count: number }>;
    topCompanies: Array<{ company: string; score: number; count: number }>;
    scoreDistribution: Array<{ label: string; count: number }>;
    expansionSuggestions: string[];
    documentsGenerated: number;
  };
}

export async function getCommandCenterData(): Promise<CommandCenterData> {
  const db = getDb();
  const { profileId } = resolveContext();

  // 1. CRM Stats
  const crm = getCrmDashboard();

  const activeSearch = db.select().from(searchProfiles)
    .where(and(eq(searchProfiles.profileId, profileId), eq(searchProfiles.isActive, true)))
    .orderBy(desc(searchProfiles.id))
    .get();

  const master = db.select().from(masterProfiles)
    .where(eq(masterProfiles.profileId, profileId))
    .orderBy(desc(masterProfiles.updatedAt))
    .get();

  // 2. Job Stats
  const allScored = excludeNonDisplayableRows(db.select({
    id: scoredJobs.id,
    score: scoredJobs.score,
    tier: scoredJobs.tier,
    portal: normalizedJobs.portal,
    company: normalizedJobs.company,
    title: normalizedJobs.title,
    url: normalizedJobs.url,
    applyUrl: normalizedJobs.applyUrl,
  }).from(scoredJobs)
    .innerJoin(normalizedJobs, eq(scoredJobs.normalizedJobId, normalizedJobs.id))
    .where(eq(scoredJobs.profileId, profileId))
    .all());

  // Actionable = Scored jobs not in applications
  const appJobIds = db.select({ id: applications.scoredJobId })
    .from(applications)
    .where(and(eq(applications.profileId, profileId), ne(applications.scoredJobId, 0)))
    .all()
    .map(a => a.id)
    .filter(id => id !== null) as number[];

  const actionable = excludeNonDisplayableRows(db.select({
    scoredJob: scoredJobs,
    normalizedJob: normalizedJobs,
    enrichment: jobEnrichments
  }).from(scoredJobs)
    .innerJoin(normalizedJobs, eq(scoredJobs.normalizedJobId, normalizedJobs.id))
    .leftJoin(jobEnrichments, eq(jobEnrichments.scoredJobId, scoredJobs.id))
    .where(and(
      eq(scoredJobs.profileId, profileId),
      appJobIds.length > 0 ? notInArray(scoredJobs.id, appJobIds) : undefined
    ))
    .orderBy(desc(scoredJobs.score))
    .all());

  const strictPriorityQueue = actionable.filter(s =>
    s.scoredJob.tier === 'A' ||
    (s.scoredJob.tier === 'B' && s.scoredJob.score >= SCORING_THRESHOLDS.PRIORITY_QUEUE_B)
  );
  const recommendedToday = strictPriorityQueue.length > 0
    ? strictPriorityQueue
    : actionable.slice(0, 5);
  const applyToday = recommendedToday.length;
  const priorityB = actionable.filter(s =>
    s.scoredJob.tier === 'B' ||
    (s.scoredJob.tier === 'C' && s.scoredJob.score >= SCORING_THRESHOLDS.TIER_C + 10)
  ).length;

  // 3. Priority Queue (Tier A + top B; falls back to best actionable matches so Today never feels empty)
  const priorityQueue = recommendedToday.slice(0, 10);

  const latestJobs = actionable.slice(0, 30);

  // 4. System Status
  const latestScan = db.select().from(scans)
    .where(eq(scans.profileId, profileId))
    .orderBy(desc(scans.startedAt))
    .get();

  const portalRuns = latestScan ? db.select().from(scanPortalRuns)
    .where(eq(scanPortalRuns.scanId, latestScan.id))
    .all() : [];

  let isScanning = false;
  let scanProgress = 0;
  if (latestScan && ['preparing', 'scraping'].includes(latestScan.status)) {
    const activeJob = db.select().from(platformJobs)
      .where(and(
        eq(platformJobs.jobType, 'scan_jobs'),
        eq(platformJobs.status, 'running')
      ))
      .orderBy(desc(platformJobs.queuedAt))
      .get();

    if (activeJob) {
      isScanning = true;
      scanProgress = activeJob.progress || 0;
    }
  }

  // 4. Funnel Data
  const funnel = await computeOverallFunnel();

  const avgScore = allScored.length > 0
    ? Math.round(allScored.reduce((acc, curr) => acc + (curr.score || 0), 0) / allScored.length)
    : 0;

  const totalScraped = excludeNonDisplayableRows(db.select({
    portal: normalizedJobs.portal,
    title: normalizedJobs.title,
    company: normalizedJobs.company,
    url: normalizedJobs.url,
    applyUrl: normalizedJobs.applyUrl,
  })
    .from(normalizedJobs)
    .where(eq(normalizedJobs.profileId, profileId))
    .all()).length;

  const portalsActive = new Set(allScored.map(s => s.portal)).size;
  const byPortalMap = allScored.reduce((acc, curr) => {
    acc[curr.portal] = (acc[curr.portal] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const byPortal = Object.entries(byPortalMap)
    .map(([portal, count]) => ({ portal, count }))
    .sort((a, b) => b.count - a.count);

  const companyMap = allScored.reduce((acc, curr) => {
    if (!curr.company) return acc;
    const entry = acc[curr.company] || { company: curr.company, totalScore: 0, count: 0 };
    entry.totalScore += curr.score || 0;
    entry.count += 1;
    acc[curr.company] = entry;
    return acc;
  }, {} as Record<string, { company: string; totalScore: number; count: number }>);
  const topCompanies = Object.values(companyMap)
    .map((item) => ({ company: item.company, score: Math.round(item.totalScore / item.count), count: item.count }))
    .sort((a, b) => b.score - a.score || b.count - a.count)
    .slice(0, 8);

  const scoreDistribution = [
    { label: '80-100 Strong fit', count: allScored.filter(j => j.score >= 80).length },
    { label: '60-79 Good fit', count: allScored.filter(j => j.score >= 60 && j.score < 80).length },
    { label: '40-59 Partial fit', count: allScored.filter(j => j.score >= 40 && j.score < 60).length },
    { label: '0-39 Skip', count: allScored.filter(j => j.score < 40).length },
  ];

  const docsGenerated = db.select({ count: sql<number>`count(*)` })
    .from(documentAssets)
    .where(eq(documentAssets.profileId, profileId))
    .get()?.count || 0;

  const locations = activeSearch ? safeJson<string[]>(activeSearch.locations, []) : [];
  const companyTypes = activeSearch ? safeJson<string[]>(activeSearch.companyTypes, []) : [];

  return {
    config: getAppConfig(),
    capabilities: getSystemCapabilities(),
    onboardingGate: getOnboardingGate(),
    crm,
    funnel,
    priorityQueue,
    latestJobs,
    profileSummary: {
      name: master?.fullName || 'Career Seeker',
      headline: master?.headline || 'Resume-first job search',
      target: activeSearch?.title || master?.targetSeniority || 'Target roles',
    },
    stats: {
      actionableJobs: actionable.length,
      applyToday,
      applyIn3Days: priorityB, // Placeholder logic: top B jobs are "next up"
      totalScraped,
      portalsActive,
      averageScore: avgScore
    },
    systemStatus: {
      lastScan: latestScan?.finishedAt ? new Date(latestScan.finishedAt).toISOString() : null,
      isScanning,
      scanProgress,
      portalHealth: portalRuns.map(r => ({
        portal: r.portal,
        status: r.status,
        jobsFound: r.jobsFound || 0,
        failureCode: safeJson<any>(r.error, {})?.code,
        message: safeJson<any>(r.error, {})?.message || r.error || undefined,
      }))
    },
    insights: {
      byPortal,
      topCompanies,
      scoreDistribution,
      expansionSuggestions: buildSearchExpansionSuggestions(actionable.length, {
        roles: activeSearch?.title ? [activeSearch.title] : [],
        locations,
        workModel: activeSearch?.workModel || undefined,
        companyTypes,
      }),
      documentsGenerated: docsGenerated,
    },
  };
}

/**
 * Interpret a queue search without changing the deterministic ranking source of truth.
 */
export async function aiSearch(query: string) {
  const data = await getCommandCenterData();
  const candidates = [...data.priorityQueue, ...data.latestJobs];
  const seen = new Set<number>();
  const uniqueCandidates = candidates.filter((item: any) => {
    const id = Number(item?.scoredJob?.id ?? item?.scored_jobs?.id ?? item?.id);
    if (!Number.isFinite(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const matches = await executeAiSearch(query, uniqueCandidates);
  const jobsById = new Map(uniqueCandidates.map((item: any) => [Number(item.scoredJob?.id ?? item.scored_jobs?.id ?? item.id), item]));
  const relatedJobs = matches.flatMap((match: any) => {
    const item = jobsById.get(Number(match.id));
    if (!item) return [];
    return [{
      id: Number(match.id),
      title: item.normalizedJob?.title,
      company: item.normalizedJob?.company,
      relevance: match.score || item.scoredJob?.score || 0,
      reason: match.reason,
    }];
  });

  const answer = relatedJobs.length
    ? `I found ${relatedJobs.length} ranked queue match${relatedJobs.length === 1 ? '' : 'es'} for "${query}". The strongest options are ${relatedJobs.slice(0, 3).map((job) => `${job.title} at ${job.company}`).join(', ')}.`
    : `No ranked queue jobs matched "${query}" yet. Try widening the role, location, or source filters, then refresh the scan.`;

  return {
    answer,
    sources: matches.map((match: any) => ({
      id: match.id,
      reason: match.reason,
      source: match.source || 'local',
    })),
    suggestedActions: relatedJobs.length
      ? ['Open the strongest match', 'Generate a fit brief', 'Save the best role']
      : ['Run a fresh scan', 'Relax filters', 'Import an official job URL'],
    relatedJobs,
  };
}
