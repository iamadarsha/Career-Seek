import { getDb } from '@/db';
import { aiRequestLogs } from '@/db/schema';
import { resolveContext } from '@/lib/platform/identity';

export interface AiLogEntry {
  taskType: 'extract_profile' | 'score_job' | 'enrich_job' | 'tailor_resume' | 'ats_check' | 'cover_letter' | 'outreach' | 'coach_answer' | 'jd_analysis' | 'custom';
  modelUsed?: string;
  promptTokens?: number;
  completionTokens?: number;
  latencyMs?: number;
  succeeded: boolean;
  errorMessage?: string;
  metadata?: any;
}

/**
 * Logs an AI request to the database for audit, billing, and performance tracking.
 */
export async function logAiRequest(entry: AiLogEntry) {
  const db = getDb();
  const { userId, profileId } = resolveContext();

  try {
    await db.insert(aiRequestLogs).values({
      userId,
      profileId,
      taskType: entry.taskType,
      modelUsed: entry.modelUsed,
      promptTokens: entry.promptTokens,
      completionTokens: entry.completionTokens,
      latencyMs: entry.latencyMs,
      succeeded: entry.succeeded,
      errorMessage: entry.errorMessage,
      metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
      createdAt: new Date(),
    });
  } catch (error) {
    // We don't want logging to crash the main feature, but we should know it failed
    console.error("Failed to log AI request:", error);
  }
}
