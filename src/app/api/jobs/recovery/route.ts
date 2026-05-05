import { NextResponse } from 'next/server';
import { JobService } from '@/lib/jobs/service';
import { resolveContext } from '@/lib/platform/identity';
import type { JobType } from '@/lib/jobs/types';
import { apiError, apiException } from '@/lib/api/errors';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const jobId = Number(body.jobId);
    const action = String(body.action || '');
    const { profileId } = resolveContext();

    if (!Number.isInteger(jobId) || jobId <= 0) {
      return apiError('invalid_job_id', 'Choose a recovered job before taking action.', 400);
    }
    if (action !== 'resume' && action !== 'discard') {
      return apiError('invalid_recovery_action', 'Recovery action must be resume or discard.', 400);
    }

    const job = await JobService.getJob(jobId);
    if (!job || job.profileId !== profileId) {
      return apiError('job_not_found', 'That recovered job was not found for this profile.', 404);
    }

    if (action === 'discard') {
      await JobService.updateStatus(job.id, 'canceled', JSON.stringify({
        code: 'user_discarded_recovery',
        message: 'User discarded interrupted work from the recovery banner.',
        discardedAt: new Date().toISOString(),
      }));
      return NextResponse.json({ ok: true, action, jobId });
    }

    const payload = JSON.parse(job.payload || '{}');
    const { enqueuePlatformJob } = await import('@/lib/queue/enqueue');
    const resumed = await enqueuePlatformJob({
      jobType: job.jobType as JobType,
      payload,
      userId: job.userId || undefined,
      profileId: job.profileId || undefined,
      priority: (job.priority || 0) + 1,
      maxAttempts: job.maxAttempts || 3,
    });
    await JobService.updateStatus(job.id, 'canceled', JSON.stringify({
      code: 'user_resumed_recovery',
      message: `User resumed interrupted work as job ${resumed.id}.`,
      resumedJobId: resumed.id,
      resumedAt: new Date().toISOString(),
    }));
    return NextResponse.json({ ok: true, action, jobId, resumedJobId: resumed.id });
  } catch (error) {
    return apiException(error, 'job_recovery_failed', 500, 'Check Redis in System Status, then try Resume again.');
  }
}
