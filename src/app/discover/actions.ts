'use server';

import { ScanOrchestrator } from '@/lib/services/scraping/orchestrator';
import { getDb } from '@/db';
import { searchProfiles, scans, scanPortalRuns, normalizedJobs, scoredJobs, jobEnrichments, platformJobs } from '@/db/schema';
import { eq, desc, and, inArray, like } from 'drizzle-orm';
import { scoreUnscoredJobs } from '@/lib/services/scoring/engine';
import { generateJobBrief } from '@/lib/services/scoring/enrichment';
import { executeAiSearch } from '@/lib/services/scoring/ai-search';

import { JobService } from '@/lib/jobs/service';
import { resolveContext } from '@/lib/platform/identity';

export async function startJobScan(profileId: number, portals: string[]) {
  const { userId, profileId: activeProfileId } = resolveContext();
  
  await JobService.enqueue({
    jobType: 'scan_jobs',
    payload: { 
      searchProfileId: profileId, 
      selectedPortals: portals 
    },
    userId,
    profileId: activeProfileId,
    priority: 10
  });

  return { success: true, message: "Scan enqueued for background processing" };
}



export async function getLatestScanStatus(profileId: number) {
  const db = getDb();
  const latestScan = db.select().from(scans)
    .where(eq(scans.searchProfileId, profileId))
    .orderBy(desc(scans.startedAt))
    .get();

  if (!latestScan) return { scan: null, portalRuns: [], progress: 0 };

  const portalRuns = db.select().from(scanPortalRuns)
    .where(eq(scanPortalRuns.scanId, latestScan.id))
    .all();

  // Try to find an active platform job for this scan
  let progress = 0;
  if (['preparing', 'scraping'].includes(latestScan.status)) {
    const activeJob = db.select().from(platformJobs)
      .where(and(
        eq(platformJobs.jobType, 'scan_jobs'),
        eq(platformJobs.status, 'running')
      ))
      .orderBy(desc(platformJobs.queuedAt))
      .get();
    
    if (activeJob && activeJob.payload) {
      const payload = JSON.parse(activeJob.payload);
      if (payload.searchProfileId === profileId) {
        progress = activeJob.progress || 0;
      }
    }
  }

  return { scan: latestScan, portalRuns, progress };
}

export async function getActiveProfile() {
  const db = getDb();
  return db.select().from(searchProfiles).where(eq(searchProfiles.isActive, true)).orderBy(desc(searchProfiles.id)).get() 
    || db.select().from(searchProfiles).orderBy(desc(searchProfiles.id)).get();
}

export async function triggerScoring() {
  const { userId, profileId } = resolveContext();
  
  await JobService.enqueue({
    jobType: 'score_jobs',
    payload: { profileId },
    userId,
    profileId,
    priority: 5
  });

  return { success: true, message: "Scoring enqueued for background processing" };
}

export async function getDashboardData(profileId: number, tierFilter?: string, portalFilter?: string, searchQuery?: string) {
  const db = getDb();
  
  // Basic query logic, using SQLite directly via Drizzle
  // We'll fetch all scored jobs with their normalized job info
  let allScored = db.select({
    scoredJob: scoredJobs,
    normalizedJob: normalizedJobs,
    enrichment: jobEnrichments
  }).from(scoredJobs)
    .leftJoin(normalizedJobs, eq(scoredJobs.normalizedJobId, normalizedJobs.id))
    .leftJoin(jobEnrichments, eq(jobEnrichments.scoredJobId, scoredJobs.id))
    .where(eq(scoredJobs.searchProfileId, profileId))
    .orderBy(desc(scoredJobs.score))
    .all();

  // Handle AI natural language search if provided
  let aiSearchResults: number[] | null = null;
  if (searchQuery) {
    const aiResults = await executeAiSearch(searchQuery, allScored.map(s => ({
      id: s.scoredJob.id,
      tier: s.scoredJob.tier,
      normalizedJob: s.normalizedJob
    })));
    aiSearchResults = aiResults.map((r: any) => r.id);
  }

  // Filter in memory for simplicity (in a real prod app with 100k jobs, do it in DB)
  let filtered = allScored;

  if (aiSearchResults) {
    filtered = filtered.filter(s => aiSearchResults!.includes(s.scoredJob.id));
    // Sort by AI results order
    filtered.sort((a, b) => aiSearchResults!.indexOf(a.scoredJob.id) - aiSearchResults!.indexOf(b.scoredJob.id));
  }

  if (tierFilter && tierFilter !== 'All') {
    filtered = filtered.filter(s => s.scoredJob.tier === tierFilter);
  }
  if (portalFilter && portalFilter !== 'All') {
    filtered = filtered.filter(s => s.normalizedJob?.portal === portalFilter);
  }

  // Stats
  const totalScored = allScored.length;
  const tierCounts = {
    A: allScored.filter(s => s.scoredJob.tier === 'A').length,
    B: allScored.filter(s => s.scoredJob.tier === 'B').length,
    C: allScored.filter(s => s.scoredJob.tier === 'C').length,
    D: allScored.filter(s => s.scoredJob.tier === 'D').length,
  };

  const portalCounts = allScored.reduce((acc, curr) => {
    const p = curr.normalizedJob?.portal;
    if (p) acc[p] = (acc[p] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return {
    jobs: filtered,
    stats: {
      total: totalScored,
      tierCounts,
      portalCounts
    }
  };
}

export async function generateBriefForJob(scoredJobId: number) {
  const db = getDb();
  
  // get details
  const jobRecord = db.select({
    scoredJob: scoredJobs,
    normalizedJob: normalizedJobs
  }).from(scoredJobs)
    .innerJoin(normalizedJobs, eq(scoredJobs.normalizedJobId, normalizedJobs.id))
    .where(eq(scoredJobs.id, scoredJobId)).get();

  if (!jobRecord) return { success: false, error: 'Not found' };

  const masterProfile = db.select().from(searchProfiles).get(); // using searchProfile or masterProfile? 
  // We should actually use masterProfiles.
  const { masterProfiles } = require('@/db/schema');
  const master = db.select().from(masterProfiles).where(eq(masterProfiles.id, jobRecord.scoredJob.masterProfileId)).get();
  const search = db.select().from(searchProfiles).where(eq(searchProfiles.id, jobRecord.scoredJob.searchProfileId)).get();

  const brief = await generateJobBrief(scoredJobId, jobRecord.normalizedJob, master, search);
  
  if (brief) {
    return { success: true, brief };
  }
  return { success: false, error: 'Failed to generate brief' };
}
