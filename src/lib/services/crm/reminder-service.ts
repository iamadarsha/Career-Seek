import { getDb } from '../../../db';
import { applicationReminders, applications } from '../../../db/schema';
import { eq, and, lte, desc, isNull } from 'drizzle-orm';
import { addTimelineEvent } from './timeline-service';
import { resolveContext } from '@/lib/platform/identity';

export function createReminder(options: {
  applicationId: number;
  title: string;
  description?: string;
  dueAt: Date;
  category?: string;
}) {
  const db = getDb();
  const { profileId } = resolveContext();
  
  // Verify ownership
  const targetApp = db.select().from(applications).where(and(eq(applications.id, options.applicationId), eq(applications.profileId, profileId))).get();
  if (!targetApp) throw new Error('Application not found or access denied');

  const result = db.insert(applicationReminders).values({
    applicationId: options.applicationId,
    title: options.title,
    description: options.description || null,
    dueAt: options.dueAt,
    category: options.category || 'follow_up',
    createdAt: new Date(),
  }).returning().get();

  addTimelineEvent({
    applicationId: options.applicationId,
    eventType: 'reminder_created',
    title: `Reminder: ${options.title}`,
    description: `Due: ${options.dueAt.toLocaleDateString()}`,
    metadata: { reminderId: result.id, dueAt: options.dueAt.toISOString() },
  });

  // Update the application's nextFollowUpAt
  const currentNext = targetApp.nextFollowUpAt ? new Date(targetApp.nextFollowUpAt) : null;
  if (!currentNext || options.dueAt < currentNext) {
    db.update(applications)
      .set({ nextFollowUpAt: options.dueAt, updatedAt: new Date() })
      .where(and(eq(applications.id, options.applicationId), eq(applications.profileId, profileId)))
      .run();
  }

  return result;
}

export function completeReminder(reminderId: number) {
  const db = getDb();
  const { profileId } = resolveContext();
  
  // Verify ownership via join
  const reminder = db.select({
    id: applicationReminders.id,
    applicationId: applicationReminders.applicationId,
    title: applicationReminders.title,
  })
    .from(applicationReminders)
    .innerJoin(applications, eq(applicationReminders.applicationId, applications.id))
    .where(and(eq(applicationReminders.id, reminderId), eq(applications.profileId, profileId)))
    .get();
    
  if (!reminder) throw new Error('Reminder not found or access denied');

  db.update(applicationReminders)
    .set({ isCompleted: true, completedAt: new Date() })
    .where(eq(applicationReminders.id, reminderId))
    .run();

  addTimelineEvent({
    applicationId: reminder.applicationId,
    eventType: 'reminder_completed',
    title: `Completed: ${reminder.title}`,
  });

  // Recalculate nextFollowUpAt for the application
  recalculateNextFollowUp(reminder.applicationId, profileId);

  return { success: true };
}

export function deleteReminder(reminderId: number) {
  const db = getDb();
  const { profileId } = resolveContext();
  
  const reminder = db.select({
    id: applicationReminders.id,
    applicationId: applicationReminders.applicationId,
  })
    .from(applicationReminders)
    .innerJoin(applications, eq(applicationReminders.applicationId, applications.id))
    .where(and(eq(applicationReminders.id, reminderId), eq(applications.profileId, profileId)))
    .get();
    
  if (!reminder) return;
  
  db.delete(applicationReminders).where(eq(applicationReminders.id, reminderId)).run();
  recalculateNextFollowUp(reminder.applicationId, profileId);
}

export function getReminders(applicationId: number) {
  const db = getDb();
  const { profileId } = resolveContext();
  
  return db.select({
    id: applicationReminders.id,
    applicationId: applicationReminders.applicationId,
    title: applicationReminders.title,
    description: applicationReminders.description,
    dueAt: applicationReminders.dueAt,
    isCompleted: applicationReminders.isCompleted,
    completedAt: applicationReminders.completedAt,
    category: applicationReminders.category,
    createdAt: applicationReminders.createdAt,
  })
    .from(applicationReminders)
    .innerJoin(applications, eq(applicationReminders.applicationId, applications.id))
    .where(and(eq(applicationReminders.applicationId, applicationId), eq(applications.profileId, profileId)))
    .orderBy(applicationReminders.dueAt)
    .all();
}

export function getOverdueReminders() {
  const db = getDb();
  const { profileId } = resolveContext();
  const now = new Date();
  
  return db.select({
    id: applicationReminders.id,
    applicationId: applicationReminders.applicationId,
    title: applicationReminders.title,
    dueAt: applicationReminders.dueAt,
  })
    .from(applicationReminders)
    .innerJoin(applications, eq(applicationReminders.applicationId, applications.id))
    .where(and(
      lte(applicationReminders.dueAt, now),
      eq(applicationReminders.isCompleted, false),
      eq(applications.profileId, profileId)
    ))
    .orderBy(applicationReminders.dueAt)
    .all();
}

export function getUpcomingReminders(daysAhead: number = 7) {
  const db = getDb();
  const { profileId } = resolveContext();
  const now = new Date();
  const future = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
  
  return db.select({
    id: applicationReminders.id,
    applicationId: applicationReminders.applicationId,
    title: applicationReminders.title,
    dueAt: applicationReminders.dueAt,
  })
    .from(applicationReminders)
    .innerJoin(applications, eq(applicationReminders.applicationId, applications.id))
    .where(and(
      lte(applicationReminders.dueAt, future),
      eq(applicationReminders.isCompleted, false),
      eq(applications.profileId, profileId)
    ))
    .orderBy(applicationReminders.dueAt)
    .all();
}

export function getDueToday() {
  const db = getDb();
  const { profileId } = resolveContext();
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  
  return db.select({
    id: applicationReminders.id,
    applicationId: applicationReminders.applicationId,
    title: applicationReminders.title,
    dueAt: applicationReminders.dueAt,
  })
    .from(applicationReminders)
    .innerJoin(applications, eq(applicationReminders.applicationId, applications.id))
    .where(and(
      lte(applicationReminders.dueAt, today),
      eq(applicationReminders.isCompleted, false),
      eq(applications.profileId, profileId)
    ))
    .orderBy(applicationReminders.dueAt)
    .all();
}

function recalculateNextFollowUp(applicationId: number, profileId: number) {
  const db = getDb();
  const pending = db.select()
    .from(applicationReminders)
    .where(and(
      eq(applicationReminders.applicationId, applicationId),
      eq(applicationReminders.isCompleted, false),
    ))
    .orderBy(applicationReminders.dueAt)
    .limit(1)
    .get();

  db.update(applications)
    .set({
      nextFollowUpAt: pending ? pending.dueAt : null,
      updatedAt: new Date(),
    })
    .where(and(eq(applications.id, applicationId), eq(applications.profileId, profileId)))
    .run();
}

