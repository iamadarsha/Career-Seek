/**
 * Application Service — Phase G
 * 
 * CRUD and lifecycle management for application records.
 */

import { getDb } from '../../../db';
import {
  applications,
  scoredJobs,
  normalizedJobs,
  ApplicationStatus,
  APPLICATION_STATUSES,
} from '../../../db/schema';
import { eq, desc, and, isNull, isNotNull, sql } from 'drizzle-orm';
import { addTimelineEvent } from './timeline-service';
import { resolveContext } from '@/lib/platform/identity';

// ── Status lifecycle transitions ───────────────────────────────────────────

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  saved: 'Saved',
  preparing: 'Preparing',
  applied: 'Applied',
  follow_up_due: 'Follow-up Due',
  recruiter_replied: 'Recruiter Replied',
  interview_scheduled: 'Interview Scheduled',
  interviewed: 'Interviewed',
  assessment: 'Assessment',
  offer: 'Offer',
  rejected: 'Rejected',
  archived: 'Archived',
};

export function getStatusLabel(status: ApplicationStatus): string {
  return STATUS_LABELS[status] || status;
}

export function getStatusColor(status: ApplicationStatus): string {
  const colors: Record<ApplicationStatus, string> = {
    saved: '#86868B',
    preparing: '#FF9500',
    applied: '#007AFF',
    follow_up_due: '#FF3B30',
    recruiter_replied: '#34C759',
    interview_scheduled: '#AF52DE',
    interviewed: '#5856D6',
    assessment: '#FF9500',
    offer: '#34C759',
    rejected: '#FF3B30',
    archived: '#8E8E93',
  };
  return colors[status] || '#86868B';
}

// ── CRUD operations ────────────────────────────────────────────────────────

export function createApplication(options: {
  scoredJobId?: number;
  normalizedJobId?: number;
  title: string;
  company: string;
  location?: string;
  portal?: string;
  url?: string;
  applyUrl?: string;
  scoreSnapshot?: number;
  tierSnapshot?: string;
  status?: ApplicationStatus;
  priority?: string;
}) {
  const db = getDb();
  const { profileId } = resolveContext();
  const now = new Date();

  const result = db.insert(applications).values({
    profileId,
    scoredJobId: options.scoredJobId || null,
    normalizedJobId: options.normalizedJobId || null,
    title: options.title,
    company: options.company,
    location: options.location || null,
    portal: options.portal || null,
    url: options.url || null,
    applyUrl: options.applyUrl || null,
    status: options.status || 'saved',
    scoreSnapshot: options.scoreSnapshot || null,
    tierSnapshot: options.tierSnapshot || null,
    priority: options.priority || 'normal',
    savedAt: now,
    appliedAt: options.status === 'applied' ? now : null,
    lastStatusChangeAt: now,
    createdAt: now,
    updatedAt: now,
  }).returning().get();

  // Record timeline event
  addTimelineEvent({
    applicationId: result.id,
    eventType: 'application_created',
    title: 'Application tracked',
    description: `Started tracking ${options.title} at ${options.company}`,
  });

  return result;
}

export function createFromScoredJob(scoredJobId: number) {
  const db = getDb();
  const { profileId } = resolveContext();
  const scored = db.select().from(scoredJobs).where(and(eq(scoredJobs.id, scoredJobId), eq(scoredJobs.profileId, profileId))).get();
  if (!scored) throw new Error('Scored job not found or access denied');

  const nj = db.select().from(normalizedJobs).where(eq(normalizedJobs.id, scored.normalizedJobId)).get();
  if (!nj) throw new Error('Normalized job not found');

  // Check if already tracked
  const existing = db.select().from(applications).where(and(eq(applications.scoredJobId, scoredJobId), eq(applications.profileId, profileId))).get();
  if (existing) return existing;

  return createApplication({
    scoredJobId,
    normalizedJobId: nj.id,
    title: nj.title,
    company: nj.company,
    location: nj.location || undefined,
    portal: nj.portal,
    url: nj.url,
    applyUrl: nj.applyUrl || undefined,
    scoreSnapshot: scored.score,
    tierSnapshot: scored.tier,
    status: 'saved',
  });
}

export function getApplication(id: number) {
  const db = getDb();
  const { profileId } = resolveContext();
  return db.select().from(applications).where(and(eq(applications.id, id), eq(applications.profileId, profileId))).get();
}

export function listApplications(filters?: {
  status?: ApplicationStatus;
  company?: string;
  portal?: string;
  priority?: string;
  search?: string;
}) {
  const db = getDb();
  const { profileId } = resolveContext();
  let query = db.select().from(applications).$dynamic();

  // Apply filters using raw SQL since drizzle's dynamic where chaining is limited
  const conditions: any[] = [eq(applications.profileId, profileId)];
  
  if (filters?.status) {
    conditions.push(eq(applications.status, filters.status));
  }
  if (filters?.company) {
    conditions.push(eq(applications.company, filters.company));
  }
  if (filters?.portal) {
    conditions.push(eq(applications.portal, filters.portal));
  }
  if (filters?.priority) {
    conditions.push(eq(applications.priority, filters.priority));
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  const results = query.orderBy(desc(applications.updatedAt)).all();

  // Client-side search filter
  if (filters?.search) {
    const term = filters.search.toLowerCase();
    return results.filter(app =>
      app.title.toLowerCase().includes(term) ||
      app.company.toLowerCase().includes(term) ||
      (app.location || '').toLowerCase().includes(term)
    );
  }

  return results;
}

export function changeStatus(applicationId: number, newStatus: ApplicationStatus) {
  const db = getDb();
  const { profileId } = resolveContext();
  const app = db.select().from(applications).where(and(eq(applications.id, applicationId), eq(applications.profileId, profileId))).get();
  if (!app) throw new Error('Application not found or access denied');

  const now = new Date();
  const updates: any = {
    status: newStatus,
    previousStatus: app.status,
    lastStatusChangeAt: now,
    updatedAt: now,
  };

  if (newStatus === 'applied' && !app.appliedAt) {
    updates.appliedAt = now;
  }
  if (newStatus === 'archived') {
    updates.archivedAt = now;
  }

  db.update(applications)
    .set(updates)
    .where(and(eq(applications.id, applicationId), eq(applications.profileId, profileId)))
    .run();

  addTimelineEvent({
    applicationId,
    eventType: 'status_changed',
    title: `Status changed to ${getStatusLabel(newStatus)}`,
    description: `Changed from ${getStatusLabel(app.status as ApplicationStatus)} to ${getStatusLabel(newStatus)}`,
    metadata: { from: app.status, to: newStatus },
  });

  return db.select().from(applications).where(and(eq(applications.id, applicationId), eq(applications.profileId, profileId))).get();
}

export function updateApplication(id: number, updates: Partial<{
  priority: string;
  tags: string;
  nextFollowUpAt: Date | null;
}>) {
  const db = getDb();
  const { profileId } = resolveContext();
  db.update(applications)
    .set({ ...updates, updatedAt: new Date() })
    .where(and(eq(applications.id, id), eq(applications.profileId, profileId)))
    .run();
  return db.select().from(applications).where(and(eq(applications.id, id), eq(applications.profileId, profileId))).get();
}

export function deleteApplication(id: number) {
  const db = getDb();
  const { profileId } = resolveContext();
  // Verify ownership
  const app = db.select().from(applications).where(and(eq(applications.id, id), eq(applications.profileId, profileId))).get();
  if (!app) throw new Error('Application not found or access denied');

  // Cascade: delete timeline, notes, reminders, documents
  const { applicationTimeline, applicationNotes, applicationReminders, applicationDocuments } = require('../../../db/schema');
  db.delete(applicationTimeline).where(eq(applicationTimeline.applicationId, id)).run();
  db.delete(applicationNotes).where(eq(applicationNotes.applicationId, id)).run();
  db.delete(applicationReminders).where(eq(applicationReminders.applicationId, id)).run();
  db.delete(applicationDocuments).where(eq(applicationDocuments.applicationId, id)).run();
  db.delete(applications).where(and(eq(applications.id, id), eq(applications.profileId, profileId))).run();
}

export function getApplicationCounts(): Record<ApplicationStatus, number> {
  const db = getDb();
  const { profileId } = resolveContext();
  const all = db.select().from(applications).where(eq(applications.profileId, profileId)).all();
  const counts = {} as Record<ApplicationStatus, number>;
  for (const status of APPLICATION_STATUSES) {
    counts[status] = 0;
  }
  for (const app of all) {
    const s = app.status as ApplicationStatus;
    if (counts[s] !== undefined) counts[s]++;
  }
  return counts;
}

export function getDistinctCompanies(): string[] {
  const db = getDb();
  const { profileId } = resolveContext();
  const results = db.selectDistinct({ company: applications.company }).from(applications).where(eq(applications.profileId, profileId)).all();
  return results.map(r => r.company).sort();
}


export function getDistinctPortals(): string[] {
  const db = getDb();
  const { profileId } = resolveContext();
  const results = db.selectDistinct({ portal: applications.portal }).from(applications).where(and(eq(applications.profileId, profileId), isNotNull(applications.portal))).all();
  return results.map(r => r.portal!).filter(Boolean).sort();
}
