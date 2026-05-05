import type { Job } from 'bullmq';
import { getHandler } from '@/lib/jobs/registry';
import { JobService } from '@/lib/jobs/service';
import { logger } from '@/lib/logger';
import {
  mirrorWorkerProgress,
  mirrorWorkerStarted,
  mirrorWorkerSucceeded,
  platformJobIdFromBullJob,
} from './platform-job-mirror';

export async function executePlatformJobFromBull(job: Job) {
  const platformJobId = platformJobIdFromBullJob(job);
  if (!platformJobId) {
    throw new Error(`BullMQ job ${job.id} is missing platformJobId`);
  }

  await mirrorWorkerStarted(job);
  await mirrorWorkerProgress(job, 5);

  const platformJob = await JobService.getJob(platformJobId);
  if (!platformJob) {
    throw new Error(`Platform job ${platformJobId} not found`);
  }

  const handler = getHandler(platformJob.jobType as any);
  if (!handler) {
    throw new Error(`No handler registered for job type: ${platformJob.jobType}`);
  }

  try {
    const payload = JSON.parse(platformJob.payload || '{}');
    const result = await handler(platformJob, payload);
    await mirrorWorkerProgress(job, 100);
    await mirrorWorkerSucceeded(job, result);
    return result;
  } catch (error) {
    logger.error({ err: error, platformJobId, bullJobId: job.id }, 'Platform job failed in BullMQ worker');
    throw error;
  }
}
