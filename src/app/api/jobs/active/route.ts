import { NextResponse } from 'next/server';
import { db } from '@/db';
import { platformJobs, platformJobLogs } from '@/db/schema';
import { and, eq, desc, inArray, or, sql } from 'drizzle-orm';
import { resolveContext } from '@/lib/platform/identity';
import { apiException } from '@/lib/api/errors';

function isRecoveryJob(job: { error?: string | null }) {
  if (!job.error) return false;
  try {
    return JSON.parse(job.error)?.code === 'process_interrupted';
  } catch {
    return false;
  }
}

export async function GET() {
  try {
    const { profileId } = resolveContext();
    // Show active jobs plus recently recovered failures so interrupted work
    // does not look like an endless spinner after restart recovery.
    const recentFailureCutoff = Date.now() - 15 * 60 * 1000;
    const jobs = await db
      .select()
      .from(platformJobs)
      .where(and(
        eq(platformJobs.profileId, profileId),
        or(
          inArray(platformJobs.status, ['queued', 'running', 'processing', 'retrying']),
          and(
            eq(platformJobs.status, 'failed'),
            sql`${platformJobs.updatedAt} >= ${recentFailureCutoff}`
          )
        )
      ))
      .orderBy(desc(platformJobs.queuedAt))
      .limit(10);

    if (jobs.length === 0) {
      return NextResponse.json({ ok: true, jobs: [], recovery: [] });
    }

    // Get logs for these jobs
    const jobIds = jobs.map(j => j.id);
    const logs = await db
      .select()
      .from(platformJobLogs)
      .where(inArray(platformJobLogs.jobId, jobIds))
      .orderBy(desc(platformJobLogs.createdAt));

    // Group logs by jobId
    const jobsWithLogs = jobs.map(job => ({
      ...job,
      logs: logs
        .filter(l => l.jobId === job.id)
        .map(l => ({
          id: l.id,
          level: l.level,
          message: l.message,
          createdAt: l.createdAt
        }))
    }));

    return NextResponse.json({
      ok: true,
      jobs: jobsWithLogs,
      recovery: jobsWithLogs.filter(isRecoveryJob).map((job) => ({
        id: job.id,
        jobType: job.jobType,
        status: job.status,
        updatedAt: job.updatedAt,
      })),
    });
  } catch (error) {
    console.error('Failed to fetch jobs:', error);
    return apiException(error, 'jobs_active_failed', 500, 'Refresh the page or open System Status to check the database and worker.');
  }
}
