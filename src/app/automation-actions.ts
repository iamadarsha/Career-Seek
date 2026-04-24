"use server";

import { getNotifications, getUnreadCount, markAsRead, markAllAsRead, archiveNotification, getPreferences, updatePreference } from "@/lib/services/automation/notification-service";
import { getDailyPriorities } from "@/lib/services/automation/urgency-service";
import { getRecentLogs, clearOldLogs } from "@/lib/services/automation/automation-logs";
import { runScheduler, initializeScheduler } from "@/lib/services/automation/scheduler-service";

export async function actionGetNotifications(includeArchived = false) {
  return await getNotifications(includeArchived);
}

export async function actionGetUnreadCount() {
  return await getUnreadCount();
}

export async function actionMarkAsRead(id: number) {
  return await markAsRead(id);
}

export async function actionMarkAllAsRead() {
  return await markAllAsRead();
}

export async function actionArchiveNotification(id: number) {
  return await archiveNotification(id);
}

export async function actionGetDailyPriorities() {
  return await getDailyPriorities();
}

export async function actionGetRecentLogs() {
  return await getRecentLogs();
}

export async function actionRunSchedulerNow() {
  await initializeScheduler(); // Ensure defaults exist
  return await runScheduler();
}

export async function actionGetPreferences() {
  return await getPreferences();
}

export async function actionUpdatePreference(id: number, data: any) {
  return await updatePreference(id, data);
}

export async function actionGetLatestBackup() {
  const { getDb } = await import("@/db");
  const { backupManifests } = await import("@/db/schema");
  const { desc } = await import("drizzle-orm");
  
  try {
    const db = getDb();
    const latest = db.select().from(backupManifests).orderBy(desc(backupManifests.createdAt)).limit(1).get();
    return { success: true, backup: latest };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
