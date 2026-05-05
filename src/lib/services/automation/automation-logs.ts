import { getDb } from "@/db";
import { automationRunLogs } from "@/db/schema";
import { desc, eq, and } from "drizzle-orm";
import { resolveContext } from '@/lib/platform/identity';

export async function logAutomationRun(data: {
  taskType: string;
  triggerReason: string;
  startedAt: Date;
  endedAt?: Date;
  status: 'success' | 'failure';
  resultSummary?: string;
  errorDetail?: string;
  profileIdOverride?: number;
  userIdOverride?: number;
}) {
  const db = getDb();
  const { userId, profileId } = resolveContext();
  const targetProfileId = data.profileIdOverride || profileId;
  const targetUserId = data.userIdOverride || userId;

  const result = db.insert(automationRunLogs).values({
    ...data,
    userId: targetUserId,
    profileId: targetProfileId,
    // Remove overrides from data before inserting
    profileIdOverride: undefined,
    userIdOverride: undefined,
  } as any).returning().get();
  return { success: true, log: result };
}

export async function getRecentLogs(limit = 50) {
  const db = getDb();
  const { profileId } = resolveContext();
  const logs = db.select()
    .from(automationRunLogs)
    .where(eq(automationRunLogs.profileId, profileId))
    .orderBy(desc(automationRunLogs.startedAt))
    .limit(limit)
    .all();
  
  return { success: true, logs };
}

export async function clearOldLogs(daysToKeep = 30) {
  const db = getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysToKeep);
  
  // Since Drizzle SQLite doesn't easily support native delete where date < X
  // we'll fetch all and delete by id, or execute a raw query.
  // For simplicity, we can fetch old ones and delete them:
  const all = db.select({ id: automationRunLogs.id, startedAt: automationRunLogs.startedAt }).from(automationRunLogs).all();
  const toDelete = all.filter(l => new Date(l.startedAt) < cutoff).map(l => l.id);
  
  if (toDelete.length > 0) {
    // Basic implementation; in production use raw SQL `DELETE FROM automation_run_logs WHERE started_at < ?`
    for (const id of toDelete) {
      db.delete(automationRunLogs).where(eq(automationRunLogs.id, id)).run();
    }
  }
  return { success: true, count: toDelete.length };
}
