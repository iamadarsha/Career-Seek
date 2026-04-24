import { scoreUnscoredJobs } from '../../services/scoring/engine';
import { JobService } from '../service';
import type { PlatformJob, JobHandler } from '../types';

/**
 * Handler for 'score_jobs' type.
 */
export const scoreJobHandler: JobHandler<{ profileId?: number }, { scoredCount: number }> = async (job: PlatformJob, payload) => {
  const profileId = payload.profileId || job.profileId;
  
  if (!profileId) {
    throw new Error('No profileId provided for score_jobs handler');
  }

  await JobService.log(job.id, 'info', `Starting batch scoring for profile ${profileId}...`);

  const count = await scoreUnscoredJobs(profileId, async (progress) => {
    await JobService.updateProgress(job.id, progress);
  });

  await JobService.log(job.id, 'info', `Scoring complete. ${count} jobs processed.`);
  
  return { scoredCount: count };
};
