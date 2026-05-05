import { getDb } from "@/db";
import { applications, applicationReminders, scoredJobs, normalizedJobs } from "@/db/schema";
import { eq, and, notExists, desc } from "drizzle-orm";
import { resolveContext } from '@/lib/platform/identity';

export async function getDailyPriorities() {
  const db = getDb();
  const { profileId } = resolveContext();
  const now = new Date();
  
  // 1. Follow-ups Due
  const overdueReminders = db.select().from(applicationReminders)
    .where(and(
      eq(applicationReminders.isCompleted, false),
      eq(applicationReminders.profileId, profileId)
    ))
    .all();
    
  const priorities: any[] = [];

  for (const rem of overdueReminders) {
    if (new Date(rem.dueAt) <= now) {
      // get app
      const app = db.select().from(applications).where(and(eq(applications.id, rem.applicationId), eq(applications.profileId, profileId))).get();
      priorities.push({
        type: 'reminder',
        title: rem.title,
        urgencyScore: 100, // highest
        entityId: rem.applicationId,
        actionUrl: `/pipeline/${rem.applicationId}`,
        company: app?.company,
      });
    }
  }

  // 2. Preparing Status (needs action)
  const preparingApps = db.select().from(applications).where(and(eq(applications.status, 'preparing'), eq(applications.profileId, profileId))).all();
  for (const app of preparingApps) {
    const daysInStatus = (now.getTime() - new Date(app.lastStatusChangeAt || app.savedAt).getTime()) / (1000 * 3600 * 24);
    if (daysInStatus > 2) {
       priorities.push({
         type: 'stale_application',
         title: `Finish applying to ${app.title}`,
         urgencyScore: 80,
         entityId: app.id,
         actionUrl: `/pipeline/${app.id}`,
         company: app.company,
       });
    }
  }

  // 3. High-fit Job Opportunities (Score > 85, not yet tracked)
  const highFitJobs = db.select({
    scoredJob: scoredJobs,
    normalizedJob: normalizedJobs,
  })
  .from(scoredJobs)
  .innerJoin(normalizedJobs, eq(scoredJobs.normalizedJobId, normalizedJobs.id))
  .where(and(
    eq(scoredJobs.profileId, profileId),
    eq(scoredJobs.tier, 'A'),
    notExists(
      db.select().from(applications).where(eq(applications.scoredJobId, scoredJobs.id))
    )
  ))
  .orderBy(desc(scoredJobs.score))
  .limit(5)
  .all();

  for (const job of highFitJobs) {
    priorities.push({
      type: 'high_fit_job',
      title: `High Fit: ${job.normalizedJob.title}`,
      urgencyScore: 70 + (job.scoredJob.score / 10), // Scale with score
      entityId: job.scoredJob.id,
      actionUrl: `/jobs/${job.scoredJob.id}`, // Assuming this route exists or matches scoring
      company: job.normalizedJob.company,
      metadata: { score: job.scoredJob.score }
    });
  }

  // 4. Follow-up Recommendation (Status 'applied', > 7 days)
  const appliedApps = db.select().from(applications)
    .where(and(
      eq(applications.status, 'applied'),
      eq(applications.profileId, profileId)
    ))
    .all();

  for (const app of appliedApps) {
    const lastChange = app.lastStatusChangeAt || app.appliedAt || app.savedAt;
    const daysSinceApplied = (now.getTime() - new Date(lastChange).getTime()) / (1000 * 3600 * 24);
    if (daysSinceApplied >= 7) {
      priorities.push({
        type: 'follow_up_recommendation',
        title: `Time to follow up?`,
        urgencyScore: 60 + Math.min(20, daysSinceApplied),
        entityId: app.id,
        actionUrl: `/pipeline/${app.id}`,
        company: app.company,
        description: `Applied ${Math.floor(daysSinceApplied)} days ago.`
      });
    }
  }

  // Sort by urgency descending
  priorities.sort((a, b) => b.urgencyScore - a.urgencyScore);

  return { success: true, priorities: priorities.slice(0, 10) };
}
