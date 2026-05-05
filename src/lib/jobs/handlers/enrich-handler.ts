import { generateJobBrief } from '../../services/scoring/enrichment';
import { JobService } from '../service';
import { getDb } from '@/db';
import { scoredJobs, normalizedJobs, masterProfiles, searchProfiles, jobEnrichments } from '@/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import type { PlatformJob, JobHandler } from '../types';

/**
 * Handler for 'enrich_jobs' type.
 * Can enrich a specific scoredJobId or a batch of unscored tier A/B jobs.
 */
export const enrichJobHandler: JobHandler<{ scoredJobId?: number, batchTier?: string, batch?: boolean, profileId?: number }, { enrichedCount: number }> = async (job: PlatformJob, payload) => {
  const db = getDb();
  const profileId = payload.profileId || job.profileId;

  if (!profileId) {
    throw new Error('No profileId provided for enrich_jobs handler');
  }

  if (payload.scoredJobId) {
    // Enrich specific job
    const jobRecord = await db.select({
      scoredJob: scoredJobs,
      normalizedJob: normalizedJobs
    }).from(scoredJobs)
      .innerJoin(normalizedJobs, eq(scoredJobs.normalizedJobId, normalizedJobs.id))
      .where(eq(scoredJobs.id, payload.scoredJobId)).get();

    if (!jobRecord) throw new Error(`Scored job ${payload.scoredJobId} not found`);

    const master = db.select().from(masterProfiles).where(eq(masterProfiles.id, jobRecord.scoredJob.masterProfileId)).get();
    const search = db.select().from(searchProfiles).where(eq(searchProfiles.id, jobRecord.scoredJob.searchProfileId)).get();

    await generateJobBrief(payload.scoredJobId, jobRecord.normalizedJob, master, search);
    return { enrichedCount: 1 };
  } else if (payload.batchTier || payload.batch) {
    // Batch enrich jobs of a specific tier or both A and B if batch: true
    const tiers = payload.batchTier ? [payload.batchTier] : ['A', 'B'];
    
    await JobService.log(job.id, 'info', `Checking for unscored jobs in tiers: ${tiers.join(', ')}...`);

    const unscored = db.select({ id: scoredJobs.id })
      .from(scoredJobs)
      .leftJoin(jobEnrichments, eq(jobEnrichments.scoredJobId, scoredJobs.id))
      .where(and(
        eq(scoredJobs.profileId, profileId),
        sql`${scoredJobs.tier} IN ${tiers}`,
        sql`${jobEnrichments.id} IS NULL`
      ))
      .all();

    if (unscored.length === 0) {
      await JobService.log(job.id, 'info', 'No jobs found that need enrichment.');
      return { enrichedCount: 0 };
    }

    await JobService.log(job.id, 'info', `Found ${unscored.length} jobs to enrich...`);

    let count = 0;
    for (let i = 0; i < unscored.length; i++) {
       const sJobId = unscored[i].id;
       const jobRecord = await db.select({
         scoredJob: scoredJobs,
         normalizedJob: normalizedJobs
       }).from(scoredJobs)
         .innerJoin(normalizedJobs, eq(scoredJobs.normalizedJobId, normalizedJobs.id))
         .where(eq(scoredJobs.id, sJobId)).get();

       if (jobRecord) {
         const master = db.select().from(masterProfiles).where(eq(masterProfiles.id, jobRecord.scoredJob.masterProfileId)).get();
         const search = db.select().from(searchProfiles).where(eq(searchProfiles.id, jobRecord.scoredJob.searchProfileId)).get();
         try {
           await generateJobBrief(sJobId, jobRecord.normalizedJob, master, search);
           count++;
         } catch (err: any) {
           await JobService.log(job.id, 'warn', `Failed to enrich job ${sJobId}: ${err.message}`);
         }
       }
       
       await JobService.updateProgress(job.id, Math.floor(((i + 1) / unscored.length) * 100));
    }
    
    return { enrichedCount: count };
  }

  throw new Error('Invalid payload for enrich_jobs: must provide scoredJobId, batchTier, or batch: true');
};
