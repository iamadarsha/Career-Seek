import type { platformJobs } from '@/db/schema';

// ─── Job type constants ────────────────────────────────────────────────────────

export const JOB_TYPES = [
  'scan_jobs',
  'score_jobs',
  'enrich_jobs',
  'generate_resume',
  'generate_cover_letter',
  'generate_outreach',
  'recompute_analytics',
  'export_report',
  'run_reminders',
] as const;

export type JobType = typeof JOB_TYPES[number];

// ─── Status union ──────────────────────────────────────────────────────────────

export type JobStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'retrying'
  | 'canceled';

// ─── Domain types ─────────────────────────────────────────────────────────────

export type PlatformJob = typeof platformJobs.$inferSelect;

export interface EnqueueJobInput<T> {
  jobType: JobType;
  payload: T;
  userId?: number;
  profileId?: number;
  priority?: number;
  maxAttempts?: number;
}

/**
 * A job handler receives the full job row plus the already-parsed payload.
 * It must return a serialisable result (written to platform_jobs.result as JSON).
 */
export type JobHandler<TPayload, TResult> = (
  job: PlatformJob,
  payload: TPayload,
) => Promise<TResult>;
