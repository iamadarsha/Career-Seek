import { JobService } from './service';
import { getHandler } from './registry';
import type { PlatformJob } from './types';

export class JobExecutor {
  /**
   * Execute a specific job by ID.
   */
  static async execute(jobId: number): Promise<void> {
    const job = await JobService.getJob(jobId);
    if (!job) {
      console.error(`[JobExecutor] Job ${jobId} not found`);
      return;
    }

    if (job.status === 'succeeded' || job.status === 'canceled') {
      console.warn(`[JobExecutor] Job ${jobId} is already in a terminal state: ${job.status}`);
      return;
    }

    const handler = getHandler(job.jobType as any);
    if (!handler) {
      const error = `No handler registered for job type: ${job.jobType}`;
      await JobService.updateStatus(jobId, 'failed', error);
      console.error(`[JobExecutor] ${error}`);
      return;
    }

    try {
      await JobService.updateStatus(jobId, 'running');
      
      const payload = JSON.parse(job.payload || '{}');
      console.log(`[JobExecutor] Running job ${jobId} (${job.jobType})...`);
      
      const result = await handler(job, payload);
      
      await JobService.updateStatus(jobId, 'succeeded', undefined, result);
      console.log(`[JobExecutor] Job ${jobId} succeeded`);
    } catch (error: any) {
      const errorMessage = error.message || String(error);
      console.error(`[JobExecutor] Job ${jobId} failed:`, error);

      const attempts = (job.attempts || 0) + 1;
      const maxAttempts = job.maxAttempts || 3;

      if (attempts < maxAttempts) {
        // Exponential backoff: 1m, 4m, 9m, 16m...
        const backoffMinutes = Math.pow(attempts, 2);
        const nextRetryAt = new Date(Date.now() + backoffMinutes * 60 * 1000);
        
        await JobService.updateStatus(jobId, 'retrying', errorMessage, undefined, nextRetryAt);
        console.log(`[JobExecutor] Job ${jobId} scheduled for retry at ${nextRetryAt.toISOString()}`);
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

    console.log(`[JobExecutor] Processing ${pendingJobs.length} pending jobs...`);

    // Process jobs in parallel with a simple concurrency limit
    const concurrencyLimit = 3;
    for (let i = 0; i < pendingJobs.length; i += concurrencyLimit) {
      const chunk = pendingJobs.slice(i, i + concurrencyLimit);
      await Promise.all(chunk.map(job => 
        this.execute(job.id).catch(error => {
          console.error(`[JobExecutor] Unhandled error during job ${job.id} execution:`, error);
        })
      ));
    }
  }
}
