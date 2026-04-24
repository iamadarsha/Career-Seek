import { ScanOrchestrator } from '../../services/scraping/orchestrator';
import { JobService } from '../service';
import type { PlatformJob, JobHandler } from '../types';

/**
 * Handler for 'scan_jobs' type.
 * Wraps the existing ScanOrchestrator logic.
 */
export const scanJobHandler: JobHandler<{ searchProfileId: number, selectedPortals: string[] }, { totalJobsFound: number }> = async (job: PlatformJob, payload) => {
  const orchestrator = new ScanOrchestrator();
  
  let totalFound = 0;

  // Use the orchestrator but pipe progress into job logs
  await orchestrator.runScan(
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
    }
  );

  return { totalJobsFound: totalFound };
};
