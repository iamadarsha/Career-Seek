import { getDb } from "@/db";
import { scheduledTasks } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { logAutomationRun } from "./automation-logs";
import { checkStaleOpportunities, checkReminders } from "./rules-engine";
import { resolveContext } from '@/lib/platform/identity';
import { exportWorkspaceBackup } from '../integrations/backup-service';
import { searchProfiles } from '@/db/schema';
import { enqueuePlatformJob, enqueueScrapeJob } from '@/lib/queue/enqueue';

export async function runScheduler() {
  const db = getDb();
  const now = new Date();
  
  // Get all tasks
  const tasks = db.select().from(scheduledTasks).all();

  for (const task of tasks) {
    // 1. Check lock
    if (task.status === 'running' && task.lockedUntil && new Date(task.lockedUntil) > now) {
      continue; // Still locked and running
    }

    // 2. Check if due
    if (task.nextRunAt && new Date(task.nextRunAt) > now) {
      continue; // Not due yet
    }

    // 3. Lock the task (set running status and lockedUntil for e.g. 5 minutes)
    const lockDurationMs = 5 * 60 * 1000;
    db.update(scheduledTasks)
      .set({ 
        status: 'running', 
        lockedUntil: new Date(now.getTime() + lockDurationMs) 
      })
      .where(eq(scheduledTasks.id, task.id))
      .run();

    const startTime = new Date();
    let success = false;
    let resultSummary = '';
    let errorDetail = '';

    try {
      // Execute the task based on type
      if (task.taskType === 'stale_opportunity') {
        const res = await checkStaleOpportunities(task.profileId || undefined);
        success = res.success;
        resultSummary = `Found ${res.count} stale opportunities`;
      } else if (task.taskType === 'check_reminders') {
        const res = await checkReminders(task.profileId || undefined);
        success = res.success;
        resultSummary = `Triggered ${res.count} overdue reminders`;
      } else if (task.taskType === 'scan_jobs') {
        const profileId = task.profileId;
        if (!profileId) throw new Error("Task missing profileId");

        // Find active search profile
        const activeSearchProfile = db.select()
          .from(searchProfiles)
          .where(and(
            eq(searchProfiles.profileId, profileId),
            eq(searchProfiles.isActive, true)
          ))
          .get();

        if (activeSearchProfile) {
          const portals = JSON.parse(activeSearchProfile.preferredPortals || '["linkedin", "naukri"]');
          await enqueueScrapeJob({
            profileId,
            searchProfileId: activeSearchProfile.id,
            selectedPortals: portals,
            bypassCache: false,
          }, {
            profileId,
          });
          success = true;
          resultSummary = `Enqueued scan for search profile: ${activeSearchProfile.title}`;
        } else {
          success = false;
          resultSummary = 'No active search profile found for scan';
        }
      } else if (task.taskType === 'score_jobs') {
        const profileId = task.profileId;
        if (!profileId) throw new Error("Task missing profileId");
        
        await enqueuePlatformJob({
          jobType: 'score_jobs',
          profileId,
          payload: {}
        });
        success = true;
        resultSummary = 'Enqueued background scoring job';
      } else if (task.taskType === 'enrich_jobs') {
        const profileId = task.profileId;
        if (!profileId) throw new Error("Task missing profileId");
        
        await enqueuePlatformJob({
          jobType: 'enrich_jobs',
          profileId,
          payload: { batch: true }
        });
        success = true;
        resultSummary = 'Enqueued background enrichment job';
      } else if (task.taskType === 'auto_backup') {
        const res = await exportWorkspaceBackup();
        success = res.success;
        resultSummary = `System snapshot created: ${res.totalRecords} records`;
      } else {
        throw new Error(`Unknown task type: ${task.taskType}`);
      }

    } catch (err: any) {
      success = false;
      errorDetail = err.message || 'Unknown error';
    }

    // 4. Log the run
    await logAutomationRun({
      taskType: task.taskType,
      triggerReason: 'scheduled',
      startedAt: startTime,
      endedAt: new Date(),
      status: success ? 'success' : 'failure',
      resultSummary,
      errorDetail,
      profileIdOverride: task.profileId || undefined,
      userIdOverride: task.userId || undefined,
    });

    // 5. Unlock and calculate next run.
    const intervalMap: Record<string, number> = {
      'scan_jobs': 24,
      'score_jobs': 4,      // Score every 4 hours
      'enrich_jobs': 12,    // Enrich twice a day
      'check_reminders': 1,
      'stale_opportunity': 12,
      'auto_backup': 168
    };
    const intervalHours = intervalMap[task.taskType] || 24;
    const nextRun = new Date();
    nextRun.setHours(nextRun.getHours() + intervalHours);

    db.update(scheduledTasks)
      .set({
        status: success ? 'idle' : 'failed',
        lastRunAt: new Date(),
        nextRunAt: nextRun,
        lockedUntil: null,
        errorCount: success ? 0 : task.errorCount! + 1,
      })
      .where(eq(scheduledTasks.id, task.id))
      .run();
  }

  return { success: true };
}

// Ensure default tasks exist
export async function initializeScheduler(targetProfileId?: number) {
  const db = getDb();
  const { userId, profileId: currentProfileId } = resolveContext();
  const profileId = targetProfileId || currentProfileId;

  const existing = db.select().from(scheduledTasks).where(eq(scheduledTasks.profileId, profileId)).all();
  const existingTypes = new Set(existing.map(t => t.taskType));

  const defaults = [
    { type: 'stale_opportunity', intervalHours: 12 },
    { type: 'check_reminders', intervalHours: 1 },
    { type: 'scan_jobs', intervalHours: 24 },
    { type: 'score_jobs', intervalHours: 4 },
    { type: 'enrich_jobs', intervalHours: 12 },
    { type: 'auto_backup', intervalHours: 168 } // Weekly
  ];

  for (const def of defaults) {
    if (!existingTypes.has(def.type)) {
      const next = new Date();
      next.setHours(next.getHours() + def.intervalHours); // first run offset
      db.insert(scheduledTasks).values({
        userId,
        profileId,
        taskType: def.type,
        nextRunAt: next,
      }).run();
    }
  }
}
