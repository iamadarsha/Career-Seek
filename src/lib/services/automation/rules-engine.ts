import { getDb } from "@/db";
import { applications, scoredJobs, applicationReminders, normalizedJobs } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { createNotification } from "./notification-service";
import { resolveContext } from '@/lib/platform/identity';

export async function checkStaleOpportunities(targetProfileId?: number) {
  const db = getDb();
  const { profileId: currentProfileId } = resolveContext();
  const profileId = targetProfileId || currentProfileId;
  
  let count = 0;
  const now = new Date();
  const staleThresholdDays = 7;
  const thresholdDate = new Date(now.getTime() - staleThresholdDays * 24 * 60 * 60 * 1000);

  // 1. Stale Tier A jobs (no application created yet)
  const tierAJobs = db.select({
      scored: scoredJobs,
      normalized: normalizedJobs,
    })
    .from(scoredJobs)
    .leftJoin(normalizedJobs, eq(scoredJobs.normalizedJobId, normalizedJobs.id))
    .where(and(
      eq(scoredJobs.tier, 'A'),
      eq(scoredJobs.profileId, profileId)
    ))
    .all();

  const existingApps = db.select().from(applications).where(eq(applications.profileId, profileId)).all();
  const trackedJobIds = new Set(existingApps.map(a => a.scoredJobId).filter(Boolean));

  for (const row of tierAJobs) {
    if (!trackedJobIds.has(row.scored.id) && new Date(row.scored.scoredAt) < thresholdDate) {
      const title = row.normalized?.title || `Job #${row.scored.id}`;
      const company = row.normalized?.company || 'Unknown Company';
      await createNotification({
        type: 'stale_opportunity',
        title: 'Stale Tier A Opportunity',
        message: `You haven't tracked "${title}" at ${company} which is a Tier A match.`,
        priority: 'high',
        actionUrl: `/discover`,
        relatedEntityId: row.scored.id,
        profileIdOverride: profileId,
      });
      count++;
    }
  }

  // 2. Applications stuck in "preparing" or "applied" for too long
  for (const app of existingApps) {
    const lastChange = new Date(app.lastStatusChangeAt || app.savedAt);
    
    if (app.status === 'preparing' && lastChange < thresholdDate) {
      await createNotification({
        type: 'stale_opportunity',
        title: 'Application Stuck',
        message: `Your application for "${app.title}" has been stuck in 'Preparing' for over ${staleThresholdDays} days.`,
        priority: 'normal',
        actionUrl: `/pipeline/${app.id}`,
        relatedEntityId: app.id,
        profileIdOverride: profileId,
      });
      count++;
    }

    // Overdue follow up checks
    if (app.nextFollowUpAt && new Date(app.nextFollowUpAt) < now && app.status !== 'archived' && app.status !== 'rejected') {
       // Only notify if we haven't already for this recently.
       await createNotification({
         type: 'urgent_reminder',
         title: 'Follow-up Due',
         message: `A follow-up is due for your application at ${app.company}.`,
         priority: 'high',
         actionUrl: `/pipeline/${app.id}`,
         relatedEntityId: app.id,
         profileIdOverride: profileId,
       });
       count++;
    }
  }

  return { success: true, count };
}

export async function checkReminders(targetProfileId?: number) {
  const db = getDb();
  const { profileId: currentProfileId } = resolveContext();
  const profileId = targetProfileId || currentProfileId;
  
  let count = 0;
  const now = new Date();
  
  // Find overdue incomplete reminders
  const reminders = db.select().from(applicationReminders)
    .where(and(
      eq(applicationReminders.isCompleted, false),
      eq(applicationReminders.profileId, profileId)
    ))
    .all();

  for (const rem of reminders) {
    if (new Date(rem.dueAt) <= now) {
      // Find associated app
      const app = db.select().from(applications).where(eq(applications.id, rem.applicationId)).get();
      const companyName = app?.company || 'an application';

      await createNotification({
        type: 'urgent_reminder',
        title: rem.title,
        message: `Reminder overdue for ${companyName}.`,
        priority: 'high',
        actionUrl: `/pipeline/${rem.applicationId}`,
        relatedEntityId: rem.applicationId,
        profileIdOverride: profileId,
      });
      count++;
    }
  }

  return { success: true, count };
}
