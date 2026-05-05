import { ScanOrchestrator } from '../../services/scraping/orchestrator';
import { scoreUnscoredJobs } from '../../services/scoring/engine';
import { indexDocuments } from '../../services/coach/embedder';
import { JobService } from '../service';
import type { PlatformJob, JobHandler } from '../types';

/**
 * Handler for 'scan_jobs' type.
 * Wraps the existing ScanOrchestrator logic.
 */
export const scanJobHandler: JobHandler<{ searchProfileId: number, selectedPortals?: string[]; bypassCache?: boolean }, { totalJobsFound: number; status: string; failedPortals: number; scoredCount: number }> = async (job: PlatformJob, payload) => {
  const orchestrator = new ScanOrchestrator();
  
  // Use the orchestrator but pipe progress into job logs
  const result = await orchestrator.runScan(
    payload.searchProfileId,
    payload.selectedPortals,
    async (update) => {
      // Log to platform_job_logs
      if (update.message) {
        await JobService.log(job.id, 'info', `${update.portal ? `[${update.portal}] ` : ''}${update.message}`);
      }
      
      // Update job progress if provided
      if (update.progress !== undefined) {
        await JobService.updateProgress(job.id, update.progress);
      }

      if (update.scanId) {
        // We could store the scanId in job metadata if needed
      }
    },
    { bypassCache: payload.bypassCache },
  );

  if (result.status === 'failed') {
    throw new Error(`Scan failed: no usable jobs found across ${result.failedPortals} failed source(s).`);
  }

  const scoredCount = job.profileId ? await scoreUnscoredJobs(job.profileId, async (progress) => {
    await JobService.updateProgress(job.id, Math.min(100, 75 + Math.floor(progress * 0.25)));
  }) : 0;

  try {
    const indexed = await indexDocuments({ includeProfile: true, includeAllJobs: true });
    await JobService.log(job.id, 'info', `Coach evidence index refreshed with ${indexed.chunksCreated} new chunk(s) from the latest scraped jobs.`);
  } catch (error) {
    await JobService.log(job.id, 'warn', `Coach evidence index refresh skipped: ${error instanceof Error ? error.message : String(error)}`);
  }

  return {
    totalJobsFound: result.totalJobsFound,
    status: result.status,
    failedPortals: result.failedPortals,
    scoredCount,
  };
};
