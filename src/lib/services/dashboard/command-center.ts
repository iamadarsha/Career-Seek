import { getDb } from '../../../db';
import { 
  applications, 
  scoredJobs, 
  normalizedJobs, 
  jobEnrichments,
  scans,
  scanPortalRuns,
  platformJobs
} from '../../../db/schema';
import { eq, and, desc, ne, notInArray, isNull, sql } from 'drizzle-orm';
import { resolveContext } from '@/lib/platform/identity';
import { SCORING_THRESHOLDS } from '../../constants/scoring';
import { getCrmDashboard } from '../crm/dashboard-crm';
import { getAppConfig } from '../../config';

import { computeOverallFunnel, FunnelStage } from '../analytics/funnel-service';

export interface CommandCenterData {
  config: any;
  crm: any;
  priorityQueue: any[];
  funnel: FunnelStage[];
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
    portalHealth: Array<{ portal: string, status: string, jobsFound: number }>;
  };
}

export async function getCommandCenterData(): Promise<CommandCenterData> {
  const db = getDb();
  const { profileId } = resolveContext();
  
  // 1. CRM Stats
  const crm = getCrmDashboard();
  
  // 2. Job Stats
  const allScored = db.select({
    score: scoredJobs.score,
    tier: scoredJobs.tier,
    portal: normalizedJobs.portal
  }).from(scoredJobs)
    .innerJoin(normalizedJobs, eq(scoredJobs.normalizedJobId, normalizedJobs.id))
    .where(eq(scoredJobs.searchProfileId, profileId))
    .all();

  // Actionable = Scored jobs not in applications
  const appJobIds = db.select({ id: applications.scoredJobId })
    .from(applications)
    .where(and(eq(applications.profileId, profileId), ne(applications.scoredJobId, 0)))
    .all()
    .map(a => a.id)
    .filter(id => id !== null) as number[];

  const actionable = db.select({
    scoredJob: scoredJobs,
    normalizedJob: normalizedJobs,
    enrichment: jobEnrichments
  }).from(scoredJobs)
    .innerJoin(normalizedJobs, eq(scoredJobs.normalizedJobId, normalizedJobs.id))
    .leftJoin(jobEnrichments, eq(jobEnrichments.scoredJobId, scoredJobs.id))
    .where(and(
      eq(scoredJobs.searchProfileId, profileId),
      appJobIds.length > 0 ? notInArray(scoredJobs.id, appJobIds) : undefined
    ))
    .orderBy(desc(scoredJobs.score))
    .all();

  const applyToday = actionable.filter(s => s.scoredJob.tier === 'A').length;
  const priorityB = actionable.filter(s => s.scoredJob.tier === 'B' && s.scoredJob.score >= SCORING_THRESHOLDS.PRIORITY_QUEUE_B).length;
  
  // 3. Priority Queue (Tier A + top B)
  const priorityQueue = actionable.filter(s => 
    s.scoredJob.tier === 'A' || 
    (s.scoredJob.tier === 'B' && s.scoredJob.score >= SCORING_THRESHOLDS.PRIORITY_QUEUE_B)
  ).slice(0, 10);

  // 4. System Status
  const latestScan = db.select().from(scans)
    .where(eq(scans.searchProfileId, profileId))
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

  const totalScraped = db.select({ count: sql<number>`count(*)` })
    .from(normalizedJobs)
    .where(eq(normalizedJobs.profileId, profileId))
    .get()?.count || 0;

  const portalsActive = new Set(allScored.map(s => s.portal)).size;

  return {
    config: getAppConfig(),
    crm,
    funnel,
    priorityQueue,
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
        jobsFound: r.jobsFound || 0
      }))
    }
  };
}

/**
 * Perform a semantic search across the system using RAG
 */
export async function aiSearch(query: string) {
  const { retrieve } = await import('../coach/retriever');
  const { answerWithContext } = await import('../coach/answer');

  // Retrieve relevant chunks
  const context = await retrieve(query, { limit: 10 });
  
  // Generate a grounded answer
  const response = await answerWithContext(query, context);

  return {
    answer: response.answer,
    sources: response.sources,
    suggestedActions: response.suggestedActions,
    relatedJobs: context
      .filter(c => c.metadata?.type === 'job')
      .map(c => ({
        id: c.metadata?.jobId,
        title: c.metadata?.title,
        company: c.metadata?.company,
        relevance: c.score
      }))
  };
}
