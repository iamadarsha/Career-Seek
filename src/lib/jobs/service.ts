import { db } from '@/db';
import { platformJobs, platformJobLogs } from '@/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import type { JobType, JobStatus, EnqueueJobInput, PlatformJob } from './types';

export class JobService {
  /**
   * Enqueue a new platform job.
   */
  static async enqueue<T>(input: EnqueueJobInput<T>): Promise<PlatformJob> {
    const { jobType, payload, userId, profileId, priority = 0, maxAttempts = 3 } = input;

    const [job] = await db
      .insert(platformJobs)
      .values({
        jobType,
        payload: JSON.stringify(payload),
        status: 'queued',
        priority,
        maxAttempts,
        attempts: 0,
        userId,
        profileId,
        queuedAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    await this.log(job.id, 'info', 'Job enqueued');
    return job;
  }

  /**
   * Get job by ID.
   */
  static async getJob(jobId: number): Promise<PlatformJob | undefined> {
    const [job] = await db
      .select()
      .from(platformJobs)
      .where(eq(platformJobs.id, jobId));
    return job;
  }

  /**
   * Update job status and handle attempt increment if running.
   */
  static async updateStatus(
    jobId: number,
    status: JobStatus,
    error?: string,
    result?: any,
    nextRetryAt?: Date
  ): Promise<void> {
    const updateData: any = {
      status,
      updatedAt: new Date(),
    };

    if (status === 'running') {
      updateData.attempts = sql`attempts + 1`;
      updateData.startedAt = new Date();
    }

    if (status === 'succeeded' || status === 'failed' || status === 'canceled') {
      updateData.finishedAt = new Date();
    }

    if (error) {
      updateData.error = error;
    }

    if (result) {
      updateData.result = JSON.stringify(result);
    }

    if (nextRetryAt) {
      updateData.nextRetryAt = nextRetryAt;
    }

    await db
      .update(platformJobs)
      .set(updateData)
      .where(eq(platformJobs.id, jobId));

    const level = status === 'failed' ? 'error' : (status === 'retrying' ? 'warn' : 'info');
    await this.log(jobId, level, error || (status === 'succeeded' ? 'Job completed successfully' : `Status updated to ${status}`));
  }

  /**
   * Add a log entry for a job.
   */
  static async log(jobId: number, level: 'info' | 'warn' | 'error', message: string, metadata?: any): Promise<void> {
    await db.insert(platformJobLogs).values({
      jobId,
      level,
      message,
      metadata: metadata ? JSON.stringify(metadata) : null,
      createdAt: new Date(),
    });
  }

  /**
   * List jobs for a specific profile.
   */
  static async listJobs(profileId: number, limit = 50) {
    return db
      .select()
      .from(platformJobs)
      .where(eq(platformJobs.profileId, profileId))
      .orderBy(sql`created_at DESC`)
      .limit(limit);
  }

  /**
   * Get all pending jobs (queued or retrying).
   */
  static async getPendingJobs(limit = 10): Promise<PlatformJob[]> {
    return db
      .select()
      .from(platformJobs)
      .where(
        and(
          eq(platformJobs.status, 'queued'),
          sql`(${platformJobs.nextRetryAt} IS NULL OR ${platformJobs.nextRetryAt} <= ${Date.now()})`
        )
      )
      .orderBy(platformJobs.priority, platformJobs.id)
      .limit(limit);
  }

  /**
   * Update job progress.
   */
  static async updateProgress(jobId: number, progress: number): Promise<void> {
    await db
      .update(platformJobs)
      .set({ 
        progress,
        updatedAt: new Date()
      })
      .where(eq(platformJobs.id, jobId));
  }

  /**
   * Find jobs that have been running for too long and mark them as failed/retrying.
   */
  static async cleanupStalledJobs(timeoutMs = 60 * 60 * 1000): Promise<number> {
    const stalledAt = new Date(Date.now() - timeoutMs);
    
    // Find running jobs that haven't been updated recently
    const stalledJobs = await db
      .select()
      .from(platformJobs)
      .where(
        and(
          eq(platformJobs.status, 'running'),
          sql`${platformJobs.updatedAt} < ${stalledAt.getTime()}`
        )
      );

    for (const job of stalledJobs) {
      const attempts = (job.attempts || 0);
      const maxAttempts = job.maxAttempts || 3;
      
      if (attempts < maxAttempts) {
        await this.updateStatus(job.id, 'retrying', `Job stalled (last update: ${job.updatedAt ? new Date(job.updatedAt).toISOString() : 'unknown'})`);
      } else {
        await this.updateStatus(job.id, 'failed', 'Job stalled and exceeded max attempts');
      }
    }

    return stalledJobs.length;
  }

  /**
   * Mark all 'running' jobs as 'retrying' on worker startup.
   * This handles jobs that were interrupted by a crash/termination.
   */
  static async recoverInterruptedJobs(): Promise<number> {
    const runningJobs = await db
      .select()
      .from(platformJobs)
      .where(eq(platformJobs.status, 'running'));

    for (const job of runningJobs) {
      await this.updateStatus(job.id, 'retrying', 'Job interrupted by worker restart');
      await this.log(job.id, 'warn', 'Detected interrupted job during worker startup; marking for retry.');
    }

    return runningJobs.length;
  }
}
