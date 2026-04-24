import { getDb } from '../../../db';
import { applicationTimeline, applications } from '../../../db/schema';
import { eq, desc, and } from 'drizzle-orm';
import { resolveContext } from '@/lib/platform/identity';

export function addTimelineEvent(options: {
  applicationId: number;
  eventType: string;
  title: string;
  description?: string;
  metadata?: Record<string, any>;
}) {
  const db = getDb();
  const { profileId } = resolveContext();
  
  // Optional: Verify ownership before inserting
  const app = db.select({ id: applications.id })
    .from(applications)
    .where(and(eq(applications.id, options.applicationId), eq(applications.profileId, profileId)))
    .get();
    
  if (!app) return null; // Or throw

  return db.insert(applicationTimeline).values({
    applicationId: options.applicationId,
    eventType: options.eventType,
    title: options.title,
    description: options.description || null,
    metadata: options.metadata ? JSON.stringify(options.metadata) : null,
    createdAt: new Date(),
  }).returning().get();
}

export function getTimeline(applicationId: number) {
  const db = getDb();
  const { profileId } = resolveContext();
  
  return db.select({
    id: applicationTimeline.id,
    applicationId: applicationTimeline.applicationId,
    eventType: applicationTimeline.eventType,
    title: applicationTimeline.title,
    description: applicationTimeline.description,
    metadata: applicationTimeline.metadata,
    createdAt: applicationTimeline.createdAt,
  })
    .from(applicationTimeline)
    .innerJoin(applications, eq(applicationTimeline.applicationId, applications.id))
    .where(and(
      eq(applicationTimeline.applicationId, applicationId),
      eq(applications.profileId, profileId)
    ))
    .orderBy(desc(applicationTimeline.createdAt))
    .all();
}

export function getRecentActivity(limit: number = 20) {
  const db = getDb();
  const { profileId } = resolveContext();
  
  return db.select({
    id: applicationTimeline.id,
    applicationId: applicationTimeline.applicationId,
    eventType: applicationTimeline.eventType,
    title: applicationTimeline.title,
    description: applicationTimeline.description,
    metadata: applicationTimeline.metadata,
    createdAt: applicationTimeline.createdAt,
  })
    .from(applicationTimeline)
    .innerJoin(applications, eq(applicationTimeline.applicationId, applications.id))
    .where(eq(applications.profileId, profileId))
    .orderBy(desc(applicationTimeline.createdAt))
    .limit(limit)
    .all();
}

