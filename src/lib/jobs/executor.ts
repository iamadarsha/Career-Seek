import { JobService } from './service';
import { getHandler } from './registry';
import type { PlatformJob } from './types';
import { logger } from '@/lib/logger';

export class JobExecutor {
  /**
   * Execute a specific job by ID.
   */
  static async execute(jobId: number): Promise<void> {
    const job = await JobService.getJob(jobId);
    if (!job) {
      logger.error({ jobId }, 'Job not found');
      return;
    }

    if (job.status === 'succeeded' || job.status === 'canceled') {
      logger.warn({ jobId, status: job.status }, 'Job is already in a terminal state');
      return;
    }

    const handler = getHandler(job.jobType as any);
    if (!handler) {
      const error = `No handler registered for job type: ${job.jobType}`;
      await JobService.updateStatus(jobId, 'failed', error);
      logger.error({ jobId, jobType: job.jobType }, error);
      return;
    }

    try {
      await JobService.updateStatus(jobId, 'running');
      
      const payload = JSON.parse(job.payload || '{}');
      logger.info({ jobId, jobType: job.jobType }, 'Running platform job');
      
      const result = await handler(job, payload);
      
      await JobService.updateStatus(jobId, 'succeeded', undefined, result);
      logger.info({ jobId }, 'Platform job succeeded');
    } catch (error: any) {
      const errorMessage = error.message || String(error);
      logger.error({ err: error, jobId }, 'Platform job failed');

      const attempts = (job.attempts || 0) + 1;
      const maxAttempts = job.maxAttempts || 3;

      if (attempts < maxAttempts) {
        // Exponential backoff: 1m, 4m, 9m, 16m...
        const backoffMinutes = Math.pow(attempts, 2);
        const nextRetryAt = new Date(Date.now() + backoffMinutes * 60 * 1000);
        
        await JobService.updateStatus(jobId, 'retrying', errorMessage, undefined, nextRetryAt);
        logger.warn({ jobId, nextRetryAt }, 'Platform job scheduled for retry');
      } else {
        await JobService.updateStatus(jobId, 'failed', errorMessage);
      }
    }
  }

  /**
   * Run all pending jobs (sequentially for now).
   */
  static async processQueue(): Promise<void> {
    const pendingJobs = await JobService.getPendingJobs(10);
    
    if (pendingJobs.length === 0) {
      return;
    }

    logger.info({ count: pendingJobs.length }, 'Processing pending platform jobs');

    // Process jobs in parallel with a simple concurrency limit
    const concurrencyLimit = 3;
    for (let i = 0; i < pendingJobs.length; i += concurrencyLimit) {
      const chunk = pendingJobs.slice(i, i + concurrencyLimit);
      await Promise.all(chunk.map(job => 
        this.execute(job.id).catch(error => {
          logger.error({ err: error, jobId: job.id }, 'Unhandled error during platform job execution');
        })
      ));
    }
  }
}
