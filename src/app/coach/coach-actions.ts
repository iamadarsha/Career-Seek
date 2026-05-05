'use server';

/**
 * Coach Server Actions — Phase F
 * 
 * Orchestrates indexing, retrieval, answer generation, and persistence
 * for the AI Coach workspace.
 */

import { indexDocuments, getIndexStatus, isIndexStale } from '../../lib/services/coach/embedder';
import { getSuggestedPrompts } from '../../lib/services/coach/answer';
import { answerWithCoachRag } from '../../lib/services/coach/rag-engine';
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
import { and, eq, desc, isNull } from 'drizzle-orm';
import { resolveContext } from '../../lib/platform/identity';
import { shouldHideValidationJob } from '../../lib/services/documents/asset-filters';

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
  return await indexDocuments({ includeProfile: true, forceReindex: true });
}

export async function reindexJob(scoredJobId: number) {
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

  // 1. Get conversation context before saving this turn so the prompt is not duplicated.
  const history = getConversationContext(options.threadId, 6);

  // 2. Save user message
  addUserMessage(options.threadId, options.question);

  // 3. Ensure index exists for the active profile and selected job.
  const db = getDb();
  const { profileId } = resolveContext();
  const existingProfileChunks = db.select().from(documentChunks)
    .where(and(eq(documentChunks.profileId, profileId), isNull(documentChunks.scoredJobId)))
    .limit(1).get();
  const existingJobChunks = thread.scoredJobId
    ? db.select().from(documentChunks)
      .where(and(eq(documentChunks.profileId, profileId), eq(documentChunks.scoredJobId, thread.scoredJobId)))
      .limit(1).get()
    : null;
  const staleIndex = isIndexStale({ scoredJobId: thread.scoredJobId || undefined });
  if (!existingProfileChunks || (thread.scoredJobId && !existingJobChunks) || staleIndex) {
    await indexDocuments({
      includeProfile: true,
      scoredJobId: thread.scoredJobId || undefined,
      forceReindex: staleIndex,
    });
  }

  // 4. Generate grounded answer
  const response = await answerWithCoachRag({
    question: options.question,
    scope,
    scoredJobId: thread.scoredJobId,
    conversationHistory: history,
    answerMode,
  });
  const groundedAnswer = {
    answer: response.answer,
    confidenceLevel: response.confidence,
    reasoning: response.mode === 'generated'
      ? `Generated from ${response.diagnostics.sourceCount} local source(s).`
      : response.caveats[0],
    sourceReferences: response.sourceReferences.map((ref) => ({
      chunkIndex: ref.citationIndex,
      relevance: ref.relevance,
    })),
    suggestedFollowUps: response.suggestedFollowUps,
    caveats: response.caveats,
  };

  // 5. Persist assistant message with sources
  const assistantMsg = addAssistantMessage(
    options.threadId,
    groundedAnswer,
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
      content: groundedAnswer.answer,
      confidenceLevel: groundedAnswer.confidenceLevel,
      reasoning: groundedAnswer.reasoning,
      suggestedFollowUps: groundedAnswer.suggestedFollowUps,
      caveats: groundedAnswer.caveats,
      sources,
    },
    meta: {
      retrievalTimeMs: response.diagnostics.retrievalTimeMs,
      generationTimeMs: response.diagnostics.generationTimeMs,
      sourcesUsed: response.sources.length,
      mode: response.mode,
      usedCloudGeneration: response.diagnostics.usedCloudGeneration,
    },
  };
}

// ── Suggested prompts ──────────────────────────────────────────────────────

export async function getCoachSuggestions(scoredJobId?: number) {
  const db = getDb();
  const { profileId } = resolveContext();

  let hasJob = false;
  let hasResume = false;
  let hasAtsReport = false;

  if (scoredJobId) {
    hasJob = !!db.select().from(scoredJobs)
      .where(and(eq(scoredJobs.id, scoredJobId), eq(scoredJobs.profileId, profileId)))
      .get();
    
    hasResume = !!db.select().from(documentAssets)
      .where(and(eq(documentAssets.scoredJobId, scoredJobId), eq(documentAssets.profileId, profileId)))
      .get();
    
    const atsReport = db.select().from(documentAssets)
      .where(and(eq(documentAssets.scoredJobId, scoredJobId), eq(documentAssets.profileId, profileId)))
      .all()
      .find(a => a.type === 'ats_report');
    hasAtsReport = !!atsReport;
  } else {
    hasResume = !!db.select().from(masterProfiles).where(eq(masterProfiles.profileId, profileId)).limit(1).get();
  }

  return getSuggestedPrompts({ hasJob, hasResume, hasAtsReport });
}

// ── Job selector for coach ─────────────────────────────────────────────────

export async function getAvailableJobs() {
  const db = getDb();
  const { profileId } = resolveContext();
  
  const rows = db.select({
    scoredJobId: scoredJobs.id,
    title: normalizedJobs.title,
    company: normalizedJobs.company,
    portal: normalizedJobs.portal,
    tier: scoredJobs.tier,
    score: scoredJobs.score,
  })
    .from(scoredJobs)
    .innerJoin(normalizedJobs, eq(scoredJobs.normalizedJobId, normalizedJobs.id))
    .where(eq(scoredJobs.profileId, profileId))
    .orderBy(desc(scoredJobs.score))
    .limit(50)
    .all();

  const jobs = rows.filter((job) => !shouldHideValidationJob(job));

  return { success: true, jobs };
}
