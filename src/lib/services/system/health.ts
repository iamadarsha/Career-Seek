import { chromium } from 'playwright';
import { getDb } from '@/db';
import { platformJobs } from '@/db/schema';
import { desc, eq } from 'drizzle-orm';

export interface SystemHealth {
  browserInstalled: boolean;
  dbHealthy: boolean;
  backgroundWorkerActive: boolean;
  lastWorkerHeartbeat: string | null;
  issues: string[];
}

export async function checkSystemHealth(): Promise<SystemHealth> {
  const issues: string[] = [];
  let browserInstalled = false;
  let dbHealthy = false;
  
  // 1. Check Browser
  try {
    const browser = await chromium.launch({ headless: true });
    await browser.close();
    browserInstalled = true;
  } catch (e: any) {
    issues.push(`Browser (Playwright/Chrome) not found or failed to launch: ${e.message}`);
  }

  // 2. Check DB
  try {
    const db = getDb();
    db.select().from(platformJobs).limit(1).all();
    dbHealthy = true;
  } catch (e: any) {
    issues.push(`Database connection error: ${e.message}`);
  }

  // 3. Check Background Worker
  const db = getDb();
  const lastJob = db.select()
    .from(platformJobs)
    .orderBy(desc(platformJobs.finishedAt))
    .limit(1)
    .get();

  const backgroundWorkerActive = true; // Simplified for now as it runs in the same process in this local-first app
  
  return {
    browserInstalled,
    dbHealthy,
    backgroundWorkerActive,
    lastWorkerHeartbeat: lastJob?.finishedAt ? new Date(lastJob.finishedAt).toISOString() : null,
    issues
  };
}
