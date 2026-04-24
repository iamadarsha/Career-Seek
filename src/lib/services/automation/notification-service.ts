import { getDb } from "@/db";
import { notifications, notificationPreferences } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { resolveContext } from '@/lib/platform/identity';

export async function getNotifications(includeArchived = false) {
  const db = getDb();
  const { profileId } = resolveContext();
  
  const results = includeArchived
    ? db.select().from(notifications).where(eq(notifications.profileId, profileId)).orderBy(desc(notifications.createdAt)).all()
    : db.select().from(notifications).where(and(eq(notifications.profileId, profileId), eq(notifications.isArchived, false))).orderBy(desc(notifications.createdAt)).all();
  return { success: true, notifications: results };
}

export async function getUnreadCount() {
  const db = getDb();
  const { profileId } = resolveContext();
  
  const results = db.select()
    .from(notifications)
    .where(and(
      eq(notifications.profileId, profileId),
      eq(notifications.isRead, false), 
      eq(notifications.isArchived, false)
    ))
    .all();
  return { success: true, count: results.length };
}

export async function markAsRead(id: number) {
  const db = getDb();
  const { profileId } = resolveContext();
  
  db.update(notifications)
    .set({ isRead: true })
    .where(and(eq(notifications.id, id), eq(notifications.profileId, profileId)))
    .run();
  return { success: true };
}

export async function markAllAsRead() {
  const db = getDb();
  const { profileId } = resolveContext();
  
  db.update(notifications)
    .set({ isRead: true })
    .where(and(eq(notifications.isRead, false), eq(notifications.profileId, profileId)))
    .run();
  return { success: true };
}

export async function archiveNotification(id: number) {
  const db = getDb();
  const { profileId } = resolveContext();
  
  db.update(notifications)
    .set({ isArchived: true })
    .where(and(eq(notifications.id, id), eq(notifications.profileId, profileId)))
    .run();
  return { success: true };
}

export async function createNotification(data: {
  type: string;
  title: string;
  message?: string;
  priority?: 'low' | 'normal' | 'high';
  actionUrl?: string;
  relatedEntityId?: number;
  profileIdOverride?: number; // Optional override for system-wide/specific profile triggers
}) {
  const db = getDb();
  const { profileId } = resolveContext();
  const targetProfileId = data.profileIdOverride || profileId;

  // Check preferences and quiet hours
  const prefs = db.select().from(notificationPreferences)
    .where(and(
      eq(notificationPreferences.profileId, targetProfileId),
      eq(notificationPreferences.category, data.type)
    )).all();
  
  const inAppEnabled = prefs.length > 0 ? prefs[0].inAppEnabled : true;
  
  if (!inAppEnabled) {
    return { success: false, reason: "disabled" };
  }

  // Determine if in quiet hours
  const now = new Date();
  const currentHour = now.getHours();
  const currentMin = now.getMinutes();
  
  if (prefs.length > 0) {
    const p = prefs[0];
    const qStart = parseInt(p.quietHoursStart?.split(':')[0] || '22');
    const qEnd = parseInt(p.quietHoursEnd?.split(':')[0] || '8');
    
    // Check if current time is within quiet hours (assumes simple hour checking for now)
    const _isQuietHour = (qStart > qEnd) 
      ? (currentHour >= qStart || currentHour < qEnd)
      : (currentHour >= qStart && currentHour < qEnd);
      
    // High priority still gets created, just maybe doesn't trigger desktop alert (handled elsewhere)
    // For now, we still persist it in-app.
  }

  const result = db.insert(notifications).values({
    profileId: targetProfileId,
    type: data.type,
    title: data.title,
    message: data.message,
    priority: data.priority || 'normal',
    actionUrl: data.actionUrl,
    relatedEntityId: data.relatedEntityId,
    createdAt: new Date(),
  }).returning().get();
  
  return { success: true, notification: result };
}

export async function getPreferences() {
  const db = getDb();
  const { profileId } = resolveContext();
  const prefs = db.select().from(notificationPreferences).where(eq(notificationPreferences.profileId, profileId)).all();
  // Ensure default categories exist if missing
  const expected = ['scans', 'reminders', 'system'];
  const existing = new Set(prefs.map(p => p.category));
  
  for (const cat of expected) {
    if (!existing.has(cat)) {
      db.insert(notificationPreferences).values({ category: cat, profileId }).run();
    }
  }
  
  return { success: true, preferences: db.select().from(notificationPreferences).where(eq(notificationPreferences.profileId, profileId)).all() };
}

export async function updatePreference(id: number, data: Partial<typeof notificationPreferences.$inferInsert>) {
  const db = getDb();
  const { profileId } = resolveContext();
  db.update(notificationPreferences)
    .set(data)
    .where(and(eq(notificationPreferences.id, id), eq(notificationPreferences.profileId, profileId)))
    .run();
  return { success: true };
}
