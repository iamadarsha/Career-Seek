import type { Job } from 'bullmq';
import { JobService } from '@/lib/jobs/service';
import type { JobStatus } from '@/lib/jobs/types';
import { logger } from '@/lib/logger';

function safeMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error || 'Unknown worker error'))
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[redacted-api-key]')
    .replace(/sk-[0-9A-Za-z_-]{20,}/g, '[redacted-api-key]')
    .slice(0, 1_000);
}

export function platformJobIdFromBullJob(job: Job): number | null {
  const id = Number((job.data as { platformJobId?: number } | undefined)?.platformJobId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function update(platformJobId: number | null, status: JobStatus, message: string, metadata?: Record<string, unknown>) {
  if (!platformJobId) return;
  const errorMessage = status === 'failed' || status === 'retrying' ? message : undefined;
  await JobService.updateStatus(platformJobId, status, errorMessage).catch((error) => {
    logger.warn({ err: error, platformJobId, status }, 'Could not mirror platform job status');
  });
  await JobService.log(platformJobId, status === 'failed' ? 'error' : status === 'retrying' ? 'warn' : 'info', message, metadata).catch((error) => {
    logger.warn({ err: error, platformJobId }, 'Could not mirror platform job log');
  });
}

export async function mirrorWorkerStarted(job: Job) {
  const platformJobId = platformJobIdFromBullJob(job);
  await update(platformJobId, 'running', `Worker started BullMQ job ${job.id}`, {
    queue: job.queueName,
    bullJobId: job.id,
    attempt: job.attemptsMade + 1,
  });
}

export async function mirrorWorkerProgress(job: Job, progress: number) {
  const platformJobId = platformJobIdFromBullJob(job);
  if (!platformJobId) return;
  await JobService.updateProgress(platformJobId, Math.max(0, Math.min(100, Math.round(progress)))).catch((error) => {
    logger.warn({ err: error, platformJobId }, 'Could not mirror BullMQ progress');
  });
}

export async function mirrorWorkerSucceeded(job: Job, result: unknown) {
  const platformJobId = platformJobIdFromBullJob(job);
  if (!platformJobId) return;
  await JobService.updateStatus(platformJobId, 'succeeded', undefined, result).catch((error) => {
    logger.warn({ err: error, platformJobId }, 'Could not mirror successful BullMQ job');
  });
}

export async function mirrorWorkerRetry(job: Job, error: unknown) {
  const platformJobId = platformJobIdFromBullJob(job);
  await update(platformJobId, 'retrying', safeMessage(error), {
    queue: job.queueName,
    bullJobId: job.id,
    attemptsMade: job.attemptsMade,
  });
}

export async function mirrorWorkerFailed(job: Job | undefined, error: unknown) {
  const platformJobId = job ? platformJobIdFromBullJob(job) : null;
  await update(platformJobId, 'failed', safeMessage(error), job ? {
    queue: job.queueName,
    bullJobId: job.id,
    attemptsMade: job.attemptsMade,
  } : undefined);
}
