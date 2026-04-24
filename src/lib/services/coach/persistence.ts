/**
 * Chat Persistence Service — Phase F
 * 
 * CRUD operations for coaching threads and messages.
 * Tracks conversation history, retrieved chunks, and source provenance.
 */

import { getDb } from '../../../db';
import { coachThreads, coachMessages, messageSources } from '../../../db/schema';
import { eq, desc } from 'drizzle-orm';
import { RetrievedChunk } from './retriever';
import { GroundedAnswer } from './answer';

// ── Thread operations ──────────────────────────────────────────────────────

export function createThread(options: {
  scoredJobId?: number;
  scope: string;
  title?: string;
}) {
  const db = getDb();
  const now = new Date();

  const result = db.insert(coachThreads).values({
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
  return db.select().from(coachThreads).where(eq(coachThreads.id, threadId)).get();
}

export function listThreads(scoredJobId?: number) {
  const db = getDb();

  if (scoredJobId) {
    return db.select()
      .from(coachThreads)
      .where(eq(coachThreads.scoredJobId, scoredJobId))
      .orderBy(desc(coachThreads.updatedAt))
      .all();
  }

  return db.select()
    .from(coachThreads)
    .orderBy(desc(coachThreads.updatedAt))
    .all();
}

export function updateThreadTitle(threadId: number, title: string) {
  const db = getDb();
  db.update(coachThreads)
    .set({ title, updatedAt: new Date() })
    .where(eq(coachThreads.id, threadId))
    .run();
}

export function deleteThread(threadId: number) {
  const db = getDb();
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

  const result = db.insert(coachMessages).values({
    threadId,
    role: 'user',
    content,
    createdAt: new Date(),
  }).returning().get();

  // Update thread timestamp
  db.update(coachThreads)
    .set({ updatedAt: new Date() })
    .where(eq(coachThreads.id, threadId))
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

  // Save source references
  for (const ref of answer.sourceReferences) {
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
    .where(eq(coachThreads.id, threadId))
    .run();

  return msg;
}

export function getThreadMessages(threadId: number) {
  const db = getDb();
  return db.select()
    .from(coachMessages)
    .where(eq(coachMessages.threadId, threadId))
    .orderBy(coachMessages.createdAt)
    .all();
}

export function getMessageSources(messageId: number) {
  const db = getDb();
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
  const thread = db.select().from(coachThreads).where(eq(coachThreads.id, threadId)).get();
  if (thread?.title) return; // Already titled

  const firstMsg = db.select()
    .from(coachMessages)
    .where(eq(coachMessages.threadId, threadId))
    .limit(1)
    .get();

  if (firstMsg) {
    const title = firstMsg.content.length > 60
      ? firstMsg.content.slice(0, 57) + '...'
      : firstMsg.content;
    updateThreadTitle(threadId, title);
  }
}
