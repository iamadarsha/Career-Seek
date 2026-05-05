/**
 * Chat Persistence Service — Phase F
 * 
 * CRUD operations for coaching threads and messages.
 * Tracks conversation history, retrieved chunks, and source provenance.
 */

import { getDb } from '../../../db';
import { coachThreads, coachMessages, messageSources, scoredJobs } from '../../../db/schema';
import { and, eq, desc } from 'drizzle-orm';
import { RetrievedChunk } from './retriever';
import { GroundedAnswer } from './answer';
import { resolveContext } from '../../platform/identity';

// ── Thread operations ──────────────────────────────────────────────────────

export function createThread(options: {
  scoredJobId?: number;
  scope: string;
  title?: string;
}) {
  const db = getDb();
  const { userId, profileId } = resolveContext();
  const now = new Date();

  if (options.scoredJobId) {
    const ownedJob = db.select().from(scoredJobs)
      .where(and(eq(scoredJobs.id, options.scoredJobId), eq(scoredJobs.profileId, profileId)))
      .get();
    if (!ownedJob) throw new Error('Scored job not found or access denied');
  }

  const result = db.insert(coachThreads).values({
    userId,
    profileId,
    title: options.title || null,
    scoredJobId: options.scoredJobId || null,
    scope: options.scope,
    createdAt: now,
    updatedAt: now,
  }).returning().get();

  return result;
}

export function getThread(threadId: number) {
  const db = getDb();
  const { profileId } = resolveContext();
  return db.select().from(coachThreads)
    .where(and(eq(coachThreads.id, threadId), eq(coachThreads.profileId, profileId)))
    .get();
}

export function listThreads(scoredJobId?: number) {
  const db = getDb();
  const { profileId } = resolveContext();

  const predicate = scoredJobId
    ? and(eq(coachThreads.profileId, profileId), eq(coachThreads.scoredJobId, scoredJobId))
    : eq(coachThreads.profileId, profileId);

  return db.select()
    .from(coachThreads)
    .where(predicate)
    .orderBy(desc(coachThreads.updatedAt))
    .all();
}

export function updateThreadTitle(threadId: number, title: string) {
  const db = getDb();
  const { profileId } = resolveContext();
  db.update(coachThreads)
    .set({ title, updatedAt: new Date() })
    .where(and(eq(coachThreads.id, threadId), eq(coachThreads.profileId, profileId)))
    .run();
}

export function deleteThread(threadId: number) {
  const db = getDb();
  const thread = getThread(threadId);
  if (!thread) return;
  // Delete sources first (due to FK)
  const msgs = db.select().from(coachMessages).where(eq(coachMessages.threadId, threadId)).all();
  for (const msg of msgs) {
    db.delete(messageSources).where(eq(messageSources.messageId, msg.id)).run();
  }
  // Delete messages
  db.delete(coachMessages).where(eq(coachMessages.threadId, threadId)).run();
  // Delete thread
  db.delete(coachThreads).where(eq(coachThreads.id, threadId)).run();
}

// ── Message operations ─────────────────────────────────────────────────────

export function addUserMessage(threadId: number, content: string) {
  const db = getDb();
  const thread = getThread(threadId);
  if (!thread) throw new Error('Thread not found or access denied');

  const result = db.insert(coachMessages).values({
    threadId,
    role: 'user',
    content,
    createdAt: new Date(),
  }).returning().get();

  // Update thread timestamp
  db.update(coachThreads)
    .set({ updatedAt: new Date() })
    .where(eq(coachThreads.id, thread.id))
    .run();

  return result;
}

export function addAssistantMessage(
  threadId: number,
  answer: GroundedAnswer,
  sources: RetrievedChunk[],
  answerMode: string = 'concise',
) {
  const db = getDb();
  const thread = getThread(threadId);
  if (!thread) throw new Error('Thread not found or access denied');

  const chunkIds = sources.map(s => s.chunkId);

  const msg = db.insert(coachMessages).values({
    threadId,
    role: 'assistant',
    content: answer.answer,
    confidenceLevel: answer.confidenceLevel,
    answerMode,
    retrievedChunkIds: JSON.stringify(chunkIds),
    createdAt: new Date(),
  }).returning().get();

  const references = answer.sourceReferences.length > 0
    ? answer.sourceReferences
    : sources.slice(0, Math.min(3, sources.length)).map((_, index) => ({
        chunkIndex: index + 1,
        relevance: 'Used as supporting local evidence.',
      }));

  // Save source references
  for (const ref of references) {
    const sourceChunk = sources[ref.chunkIndex - 1]; // 1-based index
    if (sourceChunk) {
      db.insert(messageSources).values({
        messageId: msg.id,
        chunkId: sourceChunk.chunkId,
        relevanceScore: sourceChunk.relevanceScore,
        snippetPreview: sourceChunk.content.slice(0, 200),
        sourceLabel: sourceChunk.sourceLabel,
      }).run();
    }
  }

  // Update thread timestamp
  db.update(coachThreads)
    .set({ updatedAt: new Date() })
    .where(eq(coachThreads.id, thread.id))
    .run();

  return msg;
}

export function getThreadMessages(threadId: number) {
  const db = getDb();
  const thread = getThread(threadId);
  if (!thread) return [];
  return db.select()
    .from(coachMessages)
    .where(eq(coachMessages.threadId, thread.id))
    .orderBy(coachMessages.createdAt)
    .all();
}

export function getMessageSources(messageId: number) {
  const db = getDb();
  const { profileId } = resolveContext();
  const ownedMessage = db.select({ id: coachMessages.id })
    .from(coachMessages)
    .innerJoin(coachThreads, eq(coachMessages.threadId, coachThreads.id))
    .where(and(eq(coachMessages.id, messageId), eq(coachThreads.profileId, profileId)))
    .get();
  if (!ownedMessage) return [];

  return db.select()
    .from(messageSources)
    .where(eq(messageSources.messageId, messageId))
    .all();
}

/**
 * Gets conversation history formatted for context injection.
 */
export function getConversationContext(threadId: number, maxMessages: number = 6): Array<{ role: string; content: string }> {
  const messages = getThreadMessages(threadId);
  return messages
    .slice(-maxMessages)
    .map(m => ({ role: m.role, content: m.content }));
}

/**
 * Auto-generate thread title from the first user message.
 */
export function autoTitleThread(threadId: number) {
  const db = getDb();
  const thread = getThread(threadId);
  if (thread?.title) return; // Already titled
  if (!thread) return;

  const firstMsg = db.select()
    .from(coachMessages)
    .where(and(eq(coachMessages.threadId, thread.id), eq(coachMessages.role, 'user')))
    .orderBy(coachMessages.createdAt)
    .limit(1)
    .get();

  if (firstMsg) {
    const title = firstMsg.content.length > 60
      ? firstMsg.content.slice(0, 57) + '...'
      : firstMsg.content;
    updateThreadTitle(threadId, title);
  }
}
