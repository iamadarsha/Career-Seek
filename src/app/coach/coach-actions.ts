'use server';

/**
 * Coach Server Actions — Phase F
 * 
 * Orchestrates indexing, retrieval, answer generation, and persistence
 * for the AI Coach workspace.
 */

import { indexDocuments, getIndexStatus, clearJobChunks, clearProfileChunks } from '../../lib/services/coach/embedder';
import { generateGroundedAnswer, getSuggestedPrompts } from '../../lib/services/coach/answer';
import { RetrievalScope } from '../../lib/services/coach/retriever';
import {
  createThread,
  getThread,
  listThreads,
  deleteThread,
  addUserMessage,
  addAssistantMessage,
  getThreadMessages,
  getMessageSources,
  getConversationContext,
  autoTitleThread,
} from '../../lib/services/coach/persistence';
import { getDb } from '../../db';
import {
  scoredJobs,
  normalizedJobs,
  documentAssets,
  documentChunks,
  masterProfiles,
} from '../../db/schema';
import { eq, desc, isNull } from 'drizzle-orm';

// ── Index management ───────────────────────────────────────────────────────

export async function indexForCoach(options: {
  scoredJobId?: number;
  forceReindex?: boolean;
}) {
  const result = await indexDocuments({
    includeProfile: true,
    scoredJobId: options.scoredJobId,
    forceReindex: options.forceReindex,
  });
  return result;
}

export async function getCoachIndexStatus() {
  return getIndexStatus();
}

export async function reindexProfile() {
  clearProfileChunks();
  return await indexDocuments({ includeProfile: true, forceReindex: true });
}

export async function reindexJob(scoredJobId: number) {
  clearJobChunks(scoredJobId);
  return await indexDocuments({ scoredJobId, forceReindex: true });
}

// ── Thread management ──────────────────────────────────────────────────────

export async function createCoachThread(options: {
  scoredJobId?: number;
  scope?: string;
}) {
  const thread = createThread({
    scoredJobId: options.scoredJobId,
    scope: options.scope || 'job_and_profile',
  });
  return { success: true, thread };
}

export async function getCoachThreads(scoredJobId?: number) {
  const threads = listThreads(scoredJobId);
  return { success: true, threads };
}

export async function deleteCoachThread(threadId: number) {
  deleteThread(threadId);
  return { success: true };
}

export async function getCoachMessages(threadId: number) {
  const messages = getThreadMessages(threadId);

  // Enrich messages with their sources
  const enrichedMessages = messages.map(msg => {
    if (msg.role === 'assistant') {
      const sources = getMessageSources(msg.id);
      return { ...msg, sources };
    }
    return { ...msg, sources: [] };
  });

  return { success: true, messages: enrichedMessages };
}

// ── Ask question (main flow) ───────────────────────────────────────────────

export async function askCoach(options: {
  threadId: number;
  question: string;
  scope?: RetrievalScope;
  answerMode?: 'concise' | 'detailed';
}) {
  const thread = getThread(options.threadId);
  if (!thread) throw new Error('Thread not found');

  const scope = (options.scope || thread.scope || 'job_and_profile') as RetrievalScope;
  const answerMode = options.answerMode || 'concise';

  // 1. Save user message
  addUserMessage(options.threadId, options.question);

  // 2. Get conversation context
  const history = getConversationContext(options.threadId, 6);

  // 3. Ensure index is fresh
  const db = getDb();
  const existingChunks = db.select().from(documentChunks).limit(1).get();
  if (!existingChunks) {
    // Auto-index if empty
    await indexDocuments({
      includeProfile: true,
      scoredJobId: thread.scoredJobId || undefined,
    });
  }

  // 4. Generate grounded answer
  const response = await generateGroundedAnswer(
    options.question,
    scope,
    thread.scoredJobId,
    history,
    answerMode,
  );

  // 5. Persist assistant message with sources
  const assistantMsg = addAssistantMessage(
    options.threadId,
    response.answer,
    response.sources,
    answerMode,
  );

  // 6. Auto-title the thread if it's the first question
  autoTitleThread(options.threadId);

  // 7. Get sources for the response
  const sources = getMessageSources(assistantMsg.id);

  return {
    success: true,
    message: {
      id: assistantMsg.id,
      role: 'assistant',
      content: response.answer.answer,
      confidenceLevel: response.answer.confidenceLevel,
      reasoning: response.answer.reasoning,
      suggestedFollowUps: response.answer.suggestedFollowUps,
      caveats: response.answer.caveats,
      sources,
    },
    meta: {
      retrievalTimeMs: response.retrievalTimeMs,
      generationTimeMs: response.generationTimeMs,
      sourcesUsed: response.sources.length,
    },
  };
}

// ── Suggested prompts ──────────────────────────────────────────────────────

export async function getCoachSuggestions(scoredJobId?: number) {
  const db = getDb();

  let hasJob = false;
  let hasResume = false;
  let hasAtsReport = false;

  if (scoredJobId) {
    hasJob = !!db.select().from(scoredJobs).where(eq(scoredJobs.id, scoredJobId)).get();
    
    hasResume = !!db.select().from(documentAssets)
      .where(eq(documentAssets.scoredJobId, scoredJobId))
      .get();
    
    const atsReport = db.select().from(documentAssets)
      .where(eq(documentAssets.scoredJobId, scoredJobId))
      .all()
      .find(a => a.type === 'ats_report');
    hasAtsReport = !!atsReport;
  } else {
    hasResume = !!db.select().from(masterProfiles).limit(1).get();
  }

  return getSuggestedPrompts({ hasJob, hasResume, hasAtsReport });
}

// ── Job selector for coach ─────────────────────────────────────────────────

export async function getAvailableJobs() {
  const db = getDb();
  
  const jobs = db.select({
    scoredJobId: scoredJobs.id,
    title: normalizedJobs.title,
    company: normalizedJobs.company,
    tier: scoredJobs.tier,
    score: scoredJobs.score,
  })
    .from(scoredJobs)
    .innerJoin(normalizedJobs, eq(scoredJobs.normalizedJobId, normalizedJobs.id))
    .orderBy(desc(scoredJobs.score))
    .limit(50)
    .all();

  return { success: true, jobs };
}
