import { getDb } from '../../../db';
import { applicationNotes, applications } from '../../../db/schema';
import { eq, desc, and, like } from 'drizzle-orm';
import { addTimelineEvent } from './timeline-service';
import { resolveContext } from '@/lib/platform/identity';

export function createNote(options: {
  applicationId: number;
  content: string;
  category?: string;
}) {
  const db = getDb();
  const { profileId } = resolveContext();
  
  // Verify application ownership
  const app = db.select().from(applications).where(and(eq(applications.id, options.applicationId), eq(applications.profileId, profileId))).get();
  if (!app) throw new Error('Application not found or access denied');

  const now = new Date();

  const result = db.insert(applicationNotes).values({
    applicationId: options.applicationId,
    content: options.content,
    category: options.category || 'general',
    createdAt: now,
    updatedAt: now,
  }).returning().get();

  addTimelineEvent({
    applicationId: options.applicationId,
    eventType: 'note_added',
    title: 'Note added',
    description: options.content.slice(0, 100),
    metadata: { noteId: result.id, category: options.category || 'general' },
  });

  return result;
}

export function updateNote(noteId: number, content: string, category?: string) {
  const db = getDb();
  const { profileId } = resolveContext();
  
  // Verify ownership via join
  const note = db.select({ id: applicationNotes.id })
    .from(applicationNotes)
    .innerJoin(applications, eq(applicationNotes.applicationId, applications.id))
    .where(and(eq(applicationNotes.id, noteId), eq(applications.profileId, profileId)))
    .get();
  
  if (!note) throw new Error('Note not found or access denied');

  const updates: any = { content, updatedAt: new Date() };
  if (category) updates.category = category;
  
  db.update(applicationNotes)
    .set(updates)
    .where(eq(applicationNotes.id, noteId))
    .run();
  
  return db.select().from(applicationNotes).where(eq(applicationNotes.id, noteId)).get();
}

export function deleteNote(noteId: number) {
  const db = getDb();
  const { profileId } = resolveContext();
  
  // Verify ownership via join
  const note = db.select({ id: applicationNotes.id })
    .from(applicationNotes)
    .innerJoin(applications, eq(applicationNotes.applicationId, applications.id))
    .where(and(eq(applicationNotes.id, noteId), eq(applications.profileId, profileId)))
    .get();
  
  if (!note) throw new Error('Note not found or access denied');

  db.delete(applicationNotes).where(eq(applicationNotes.id, noteId)).run();
}

export function togglePin(noteId: number) {
  const db = getDb();
  const { profileId } = resolveContext();
  
  const note = db.select()
    .from(applicationNotes)
    .innerJoin(applications, eq(applicationNotes.applicationId, applications.id))
    .where(and(eq(applicationNotes.id, noteId), eq(applications.profileId, profileId)))
    .get();
    
  if (!note) return;

  db.update(applicationNotes)
    .set({ isPinned: !note.application_notes.isPinned, updatedAt: new Date() })
    .where(eq(applicationNotes.id, noteId))
    .run();
}

export function getNotes(applicationId: number) {
  const db = getDb();
  const { profileId } = resolveContext();
  
  return db.select({
    id: applicationNotes.id,
    applicationId: applicationNotes.applicationId,
    content: applicationNotes.content,
    category: applicationNotes.category,
    isPinned: applicationNotes.isPinned,
    createdAt: applicationNotes.createdAt,
    updatedAt: applicationNotes.updatedAt,
  })
    .from(applicationNotes)
    .innerJoin(applications, eq(applicationNotes.applicationId, applications.id))
    .where(and(eq(applicationNotes.applicationId, applicationId), eq(applications.profileId, profileId)))
    .orderBy(desc(applicationNotes.isPinned), desc(applicationNotes.updatedAt))
    .all();
}

export function searchNotes(searchTerm: string) {
  const db = getDb();
  const { profileId } = resolveContext();
  
  return db.select({
    id: applicationNotes.id,
    content: applicationNotes.content,
    updatedAt: applicationNotes.updatedAt,
    applicationId: applicationNotes.applicationId
  })
    .from(applicationNotes)
    .innerJoin(applications, eq(applicationNotes.applicationId, applications.id))
    .where(and(
      eq(applications.profileId, profileId),
      like(applicationNotes.content, `%${searchTerm}%`)
    ))
    .orderBy(desc(applicationNotes.updatedAt))
    .all();
}

