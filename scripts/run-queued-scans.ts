#!/usr/bin/env tsx
/**
 * Processes all 'queued' scan_jobs directly — no BullMQ/Redis needed.
 * Run: JOBHUNT_DATA_DIR=./data npx tsx scripts/run-queued-scans.ts
 */
import { getDb } from '../src/db';
import { platformJobs, platformJobLogs } from '../src/db/schema';
import { eq, and } from 'drizzle-orm';
import { scanJobHandler } from '../src/lib/jobs/handlers/scan-handler';
import { JobService } from '../src/lib/jobs/service';

async function main() {
  const db = getDb();

  const queued = db.select().from(platformJobs)
    .where(and(eq(platformJobs.jobType, 'scan_jobs'), eq(platformJobs.status, 'queued')))
    .all();

  if (!queued.length) {
    console.log('No queued scan jobs found.');
    return;
  }

  console.log(`Found ${queued.length} queued scan job(s).`);

  for (const job of queued) {
    console.log(`\nProcessing job #${job.id}...`);
    try {
      await JobService.updateStatus(job.id, 'running');
      const payload = JSON.parse(job.payload || '{}');
      const result = await scanJobHandler(job as any, payload);
      await JobService.updateStatus(job.id, 'succeeded', undefined, result);
      console.log(`Job #${job.id} done:`, result);
    } catch (err: any) {
      await JobService.updateStatus(job.id, 'failed', err.message);
      console.error(`Job #${job.id} failed:`, err.message);
    }
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
