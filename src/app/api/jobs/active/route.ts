import { NextResponse } from 'next/server';
import { db } from '@/db';
import { platformJobs, platformJobLogs } from '@/db/schema';
import { eq, desc, inArray } from 'drizzle-orm';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const profileId = searchParams.get('profileId');

  if (!profileId) {
    return NextResponse.json({ error: 'Missing profileId' }, { status: 400 });
  }

  try {
    // Get latest 10 jobs for the profile
    const jobs = await db
      .select()
      .from(platformJobs)
      .where(eq(platformJobs.profileId, parseInt(profileId)))
      .orderBy(desc(platformJobs.queuedAt))
      .limit(10);

    if (jobs.length === 0) {
      return NextResponse.json({ jobs: [] });
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

    return NextResponse.json({ jobs: jobsWithLogs });
  } catch (error) {
    console.error('Failed to fetch jobs:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
