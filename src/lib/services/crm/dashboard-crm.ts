import { getDb } from '../../../db';
import {
  applications,
  applicationReminders,
  applicationTimeline,
  APPLICATION_STATUSES,
  ApplicationStatus,
} from '../../../db/schema';
import { eq, and, lte, desc } from 'drizzle-orm';
import { resolveContext } from '@/lib/platform/identity';

export interface CrmDashboard {
  totalApplications: number;
  applicationsThisWeek: number;
  followUpsDueToday: number;
  overdueReminders: number;
  interviewsUpcoming: number;
  savedNotApplied: number;
  staleApplications: number;
  statusCounts: Record<string, number>;
  recentActivity: Array<{
    id: number;
    eventType: string;
    title: string;
    applicationId: number;
    createdAt: any;
  }>;
  urgentItems: Array<{
    type: 'overdue' | 'follow_up' | 'stale' | 'interview';
    applicationId: number;
    title: string;
    company: string;
    detail: string;
  }>;
}

export function getCrmDashboard(): CrmDashboard {
  const db = getDb();
  const { profileId } = resolveContext();
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const staleThreshold = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000); // 14 days

  const allApps = db.select().from(applications).where(eq(applications.profileId, profileId)).all();
  
  // Status counts
  const statusCounts: Record<string, number> = {};
  for (const s of APPLICATION_STATUSES) statusCounts[s] = 0;
  for (const app of allApps) {
    if (statusCounts[app.status] !== undefined) statusCounts[app.status]++;
  }

  // Applications this week
  const appsThisWeek = allApps.filter(a => new Date(a.createdAt) >= weekAgo).length;

  // Follow-ups due today
  const dueTodayReminders = db.select({
    id: applicationReminders.id,
    applicationId: applicationReminders.applicationId,
    title: applicationReminders.title,
    dueAt: applicationReminders.dueAt,
    isCompleted: applicationReminders.isCompleted,
  })
    .from(applicationReminders)
    .innerJoin(applications, eq(applicationReminders.applicationId, applications.id))
    .where(and(
      lte(applicationReminders.dueAt, today),
      eq(applicationReminders.isCompleted, false),
      eq(applications.profileId, profileId)
    ))
    .all();

  // Overdue (past due, not completed)
  const overdueReminders = dueTodayReminders.filter(r => new Date(r.dueAt) < now);

  // Interviews upcoming
  const interviewApps = allApps.filter(a => a.status === 'interview_scheduled');

  // Saved but not applied
  const savedNotApplied = allApps.filter(a => a.status === 'saved').length;

  // Stale applications (applied > 14 days ago, still in 'applied' status)
  const staleApps = allApps.filter(a =>
    a.status === 'applied' && a.appliedAt && new Date(a.appliedAt) < staleThreshold
  );

  // Recent activity
  const recentActivity = db.select({
    id: applicationTimeline.id,
    eventType: applicationTimeline.eventType,
    title: applicationTimeline.title,
    applicationId: applicationTimeline.applicationId,
    createdAt: applicationTimeline.createdAt,
  })
    .from(applicationTimeline)
    .innerJoin(applications, eq(applicationTimeline.applicationId, applications.id))
    .where(eq(applications.profileId, profileId))
    .orderBy(desc(applicationTimeline.createdAt))
    .limit(10)
    .all();

  // Urgent items
  const urgentItems: CrmDashboard['urgentItems'] = [];

  for (const r of overdueReminders) {
    const app = allApps.find(a => a.id === r.applicationId);
    if (app) {
      urgentItems.push({
        type: 'overdue',
        applicationId: app.id,
        title: app.title,
        company: app.company,
        detail: r.title,
      });
    }
  }

  for (const app of interviewApps) {
    urgentItems.push({
      type: 'interview',
      applicationId: app.id,
      title: app.title,
      company: app.company,
      detail: 'Interview scheduled',
    });
  }

  for (const app of staleApps.slice(0, 5)) {
    const daysAgo = Math.floor((now.getTime() - new Date(app.appliedAt!).getTime()) / (24 * 60 * 60 * 1000));
    urgentItems.push({
      type: 'stale',
      applicationId: app.id,
      title: app.title,
      company: app.company,
      detail: `Applied ${daysAgo} days ago — no update`,
    });
  }

  return {
    totalApplications: allApps.length,
    applicationsThisWeek: appsThisWeek,
    followUpsDueToday: dueTodayReminders.length,
    overdueReminders: overdueReminders.length,
    interviewsUpcoming: interviewApps.length,
    savedNotApplied,
    staleApplications: staleApps.length,
    statusCounts,
    recentActivity,
    urgentItems,
  };
}

/**
 * Smart follow-up suggestions based on rules.
 */
export function getSmartSuggestions(): Array<{
  applicationId: number;
  title: string;
  company: string;
  suggestion: string;
  priority: 'high' | 'medium' | 'low';
}> {
  const db = getDb();
  const { profileId } = resolveContext();
  const now = new Date();
  const suggestions: Array<{
    applicationId: number;
    title: string;
    company: string;
    suggestion: string;
    priority: 'high' | 'medium' | 'low';
  }> = [];

  const allApps = db.select().from(applications).where(eq(applications.profileId, profileId)).all();

  for (const app of allApps) {
    // Suggest follow-up 5 days after applying
    if (app.status === 'applied' && app.appliedAt) {
      const daysSinceApplied = Math.floor((now.getTime() - new Date(app.appliedAt).getTime()) / (24 * 60 * 60 * 1000));
      if (daysSinceApplied >= 5 && daysSinceApplied < 14) {
        suggestions.push({
          applicationId: app.id,
          title: app.title,
          company: app.company,
          suggestion: `Follow up on application (applied ${daysSinceApplied} days ago)`,
          priority: 'medium',
        });
      }
      if (daysSinceApplied >= 14) {
        suggestions.push({
          applicationId: app.id,
          title: app.title,
          company: app.company,
          suggestion: `Stale application — consider following up or archiving (${daysSinceApplied} days)`,
          priority: 'high',
        });
      }
    }

    // Suggest action for 'preparing' status that's been sitting too long
    if (app.status === 'preparing') {
      const daysSaved = Math.floor((now.getTime() - new Date(app.createdAt).getTime()) / (24 * 60 * 60 * 1000));
      if (daysSaved >= 3) {
        suggestions.push({
          applicationId: app.id,
          title: app.title,
          company: app.company,
          suggestion: `Still in preparing — generate materials or apply`,
          priority: 'medium',
        });
      }
    }

    // High-score saved jobs with no action
    if (app.status === 'saved' && app.scoreSnapshot && app.scoreSnapshot >= 75) {
      suggestions.push({
        applicationId: app.id,
        title: app.title,
        company: app.company,
        suggestion: `Strong match (${app.scoreSnapshot}%) — start preparing application`,
        priority: 'high',
      });
    }
  }

  return suggestions.sort((a, b) => {
    const priority = { high: 0, medium: 1, low: 2 };
    return priority[a.priority as keyof typeof priority] - priority[b.priority as keyof typeof priority];
  }).slice(0, 10);
}

