import { NextResponse } from 'next/server';
import type { JobType } from 'bullmq';
import { apiException } from '@/lib/api/errors';

export const dynamic = 'force-dynamic';

async function queueSnapshot(queue: {
  name: string;
  getJobCounts: (...statuses: JobType[]) => Promise<Record<string, number>>;
  getJobs: (types: JobType[], start: number, end: number, asc: boolean) => Promise<Array<{
    id?: string;
    name: string;
    failedReason?: string;
    attemptsMade: number;
    timestamp: number;
    finishedOn?: number;
  }>>;
}) {
  const [counts, failed] = await Promise.all([
    queue.getJobCounts('waiting', 'active', 'delayed', 'completed', 'failed', 'paused'),
    queue.getJobs(['failed'], 0, 4, false),
  ]);

  return {
    name: queue.name,
    counts,
    lastFailures: failed.map((job) => ({
      id: job.id,
      name: job.name,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp,
      finishedOn: job.finishedOn,
    })),
  };
}

export async function GET() {
  try {
    const { aiQueue, deadLetterQueues, documentQueue, emailQueue, scrapeQueue } = await import('@/lib/queue/queues');
    const queues = await Promise.all([
      queueSnapshot(scrapeQueue),
      queueSnapshot(documentQueue),
      queueSnapshot(emailQueue),
      queueSnapshot(aiQueue),
    ]);
    const deadLetters = await Promise.all(deadLetterQueues.map((queue) => queueSnapshot(queue as any)));

    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
      queues,
      deadLetters,
    });
  } catch (error) {
    return apiException(error, 'queue_health_unavailable', 503, 'Start Redis with ./setup.sh --repair or continue with foreground-only actions.');
  }
}
