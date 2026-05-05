import { db } from '@/db';
import { platformJobs, platformJobLogs, scans } from '@/db/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';
import type { JobType, JobStatus, EnqueueJobInput, PlatformJob } from './types';

export const STALLED_JOB_TIMEOUT_MS = 10 * 60 * 1000;
const INTERRUPTED_JOB_STATUSES = ['running', 'processing'] as const;

function interruptedJobError(job: PlatformJob, timeoutMs: number) {
  return JSON.stringify({
    code: 'process_interrupted',
    message: `Job was left in ${job.status} without a heartbeat for more than ${Math.round(timeoutMs / 60000)} minutes.`,
    jobId: job.id,
    jobType: job.jobType,
    lastUpdatedAt: job.updatedAt ? new Date(job.updatedAt).toISOString() : null,
    recoveredAt: new Date().toISOString(),
  });
}

function scanInterruptedError(job: PlatformJob, timeoutMs: number) {
  return JSON.stringify({
    code: 'process_interrupted',
    message: `Interrupted platform job ${job.id}; worker recovered it after more than ${Math.round(timeoutMs / 60000)} minutes without heartbeat.`,
    platformJobId: job.id,
    jobType: job.jobType,
  });
}

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

    if (status === 'running' || status === 'processing') {
      updateData.attempts = sql`attempts + 1`;
      updateData.startedAt = new Date();
    }

    if (status === 'succeeded' || status === 'failed' || status === 'canceled') {
      updateData.finishedAt = new Date();
    }

    if (error) {
      updateData.error = error;
    } else if (status === 'succeeded') {
      updateData.error = null;
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
          inArray(platformJobs.status, ['queued', 'retrying']),
          sql`(${platformJobs.nextRetryAt} IS NULL OR ${platformJobs.nextRetryAt} <= ${Date.now()})`
        )
      )
      .orderBy(sql`${platformJobs.priority} DESC`, platformJobs.id)
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

  static async heartbeat(jobId: number, message = 'Worker heartbeat'): Promise<void> {
    await db
      .update(platformJobs)
      .set({ updatedAt: new Date() })
      .where(eq(platformJobs.id, jobId));
    await this.log(jobId, 'info', message);
  }

  /**
   * Find jobs that have been running for too long and mark them as failed/retrying.
   */
  static async cleanupStalledJobs(timeoutMs = STALLED_JOB_TIMEOUT_MS): Promise<number> {
    const stalledAt = new Date(Date.now() - timeoutMs);
    
    // Find active jobs that haven't heartbeated recently.
    const stalledJobs = await db
      .select()
      .from(platformJobs)
      .where(
        and(
          inArray(platformJobs.status, [...INTERRUPTED_JOB_STATUSES]),
          sql`(${platformJobs.updatedAt} IS NULL OR ${platformJobs.updatedAt} < ${stalledAt.getTime()})`
        )
      );

    for (const job of stalledJobs) {
      const error = interruptedJobError(job, timeoutMs);
      if (job.jobType === 'scan_jobs') {
        await this.markInterruptedScans(job, timeoutMs);
      }
      await this.updateStatus(job.id, 'failed', error);
      await this.log(job.id, 'error', 'Recovered stalled job after missing heartbeat.', {
        code: 'process_interrupted',
        previousStatus: job.status,
        timeoutMs,
      });
    }

    return stalledJobs.length;
  }

  /**
   * Mark old active jobs as failed on worker startup.
   * This handles jobs that were interrupted by a crash/termination and did not
   * heartbeat again within the timeout window.
   */
  static async recoverInterruptedJobs(timeoutMs = STALLED_JOB_TIMEOUT_MS): Promise<number> {
    return this.cleanupStalledJobs(timeoutMs);
  }

  private static async markInterruptedScans(job: PlatformJob, timeoutMs: number): Promise<void> {
    try {
      const payload = JSON.parse(job.payload || '{}');
      if (!payload.searchProfileId) return;

      db.update(scans)
        .set({
          status: 'failed',
          error: scanInterruptedError(job, timeoutMs),
          finishedAt: new Date(),
        })
        .where(and(
          eq(scans.searchProfileId, payload.searchProfileId),
          inArray(scans.status, ['queued', 'preparing', 'scraping', 'normalizing', 'deduplicating'])
        ))
        .run();
    } catch {
      // Keep recovery best-effort; the platform job record remains canonical.
    }
  }

  /**
   * Legacy helper kept for manual admin use when the operator wants to retry
   * every active job after a controlled worker restart.
   */
  static async requeueActiveJobsAfterControlledRestart(): Promise<number> {
    const activeJobs = await db
      .select()
      .from(platformJobs)
      .where(inArray(platformJobs.status, [...INTERRUPTED_JOB_STATUSES]));

    for (const job of activeJobs) {
      await this.updateStatus(job.id, 'retrying', JSON.stringify({
        code: 'process_interrupted',
        message: 'Operator requeued active job after controlled worker restart.',
        jobId: job.id,
        recoveredAt: new Date().toISOString(),
      }));
      await this.log(job.id, 'warn', 'Operator requeued active job after controlled worker restart.');
    }

    return activeJobs.length;
  }
}
