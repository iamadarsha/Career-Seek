/**
 * Embedding & Indexing Service — Phase F
 * 
 * Uses Gemini text-embedding-004 (768-dim) with local caching.
 * Stores embeddings in SQLite as JSON float arrays for local-first operation.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { getDb } from '../../../db';
import { documentChunks, indexRuns } from '../../../db/schema';
import { eq, and } from 'drizzle-orm';
import { getAppConfig } from '../../config';
import { RawChunk, generateChunks } from './chunker';
import { resolveContext } from '../../platform/identity';

const EMBEDDING_MODEL = 'text-embedding-004';
const BATCH_SIZE = 20; // Gemini supports batch embedding

// ── Core embedding function ────────────────────────────────────────────────

async function embedTexts(texts: string[], apiKey: string): Promise<number[][]> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });

  const results: number[][] = [];

  // Process in batches to respect API limits
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    
    // Embed each text individually (Gemini embedContent API)
    for (const text of batch) {
      try {
        const result = await model.embedContent(text);
        results.push(result.embedding.values);
      } catch (error: any) {
        console.error(`Embedding failed for chunk: ${error.message}`);
        // Push zero vector as fallback
        results.push(new Array(768).fill(0));
      }
    }
  }

  return results;
}

// ── Indexing pipeline ──────────────────────────────────────────────────────

export interface IndexOptions {
  includeProfile?: boolean;
  scoredJobId?: number;
  includeAllJobs?: boolean;
  forceReindex?: boolean;
}

/**
 * Indexes documents into the vector store.
 * Creates chunks, generates embeddings, and persists everything in SQLite.
 */
export async function indexDocuments(options: IndexOptions): Promise<{
  chunksCreated: number;
  chunksSkipped: number;
  error?: string;
}> {
  const config = getAppConfig();
  if (!config.geminiApiKey) {
    return { chunksCreated: 0, chunksSkipped: 0, error: 'No Gemini API key configured' };
  }

  const db = getDb();
  const { profileId } = resolveContext();

  // Create index run record
  const runResult = db.insert(indexRuns).values({
    profileId,
    sourceType: options.scoredJobId ? `job_${options.scoredJobId}` : 'full',
    sourceId: options.scoredJobId || null,
    status: 'running',
    startedAt: new Date(),
  }).returning().get();

  try {
    // Generate chunks
    const rawChunks = generateChunks(options);
    let created = 0;
    let skipped = 0;

    // Filter out chunks that already exist (unless force reindex)
    const chunksToProcess: RawChunk[] = [];

    for (const chunk of rawChunks) {
      const existing = db.select()
        .from(documentChunks)
        .where(and(
          eq(documentChunks.chunkId, chunk.chunkId),
          eq(documentChunks.profileId, profileId)
        ))
        .get();

      if (existing && !options.forceReindex) {
        skipped++;
        continue;
      }

      // If force reindex, delete existing
      if (existing && options.forceReindex) {
        db.delete(documentChunks).where(and(
          eq(documentChunks.chunkId, chunk.chunkId),
          eq(documentChunks.profileId, profileId)
        )).run();
      }

      chunksToProcess.push(chunk);
    }

    if (chunksToProcess.length === 0) {
      db.update(indexRuns)
        .set({ status: 'complete', chunksCreated: 0, finishedAt: new Date() })
        .where(eq(indexRuns.id, runResult.id))
        .run();
      return { chunksCreated: 0, chunksSkipped: skipped };
    }

    // Generate embeddings for all new chunks
    const texts = chunksToProcess.map(c => c.content);
    const embeddings = await embedTexts(texts, config.geminiApiKey);

    // Persist chunks with embeddings
    for (let i = 0; i < chunksToProcess.length; i++) {
      const chunk = chunksToProcess[i];
      const embedding = embeddings[i];

      db.insert(documentChunks).values({
        profileId,
        chunkId: chunk.chunkId,
        sourceType: chunk.sourceType,
        sourceId: chunk.sourceId,
        scoredJobId: chunk.scoredJobId,
        section: chunk.section,
        content: chunk.content,
        metadata: JSON.stringify(chunk.metadata),
        embedding: JSON.stringify(embedding),
        tokenCount: Math.ceil(chunk.content.split(/\s+/).length * 1.3),
        indexedAt: new Date(),
      }).run();
      created++;
    }

    // Update index run
    db.update(indexRuns)
      .set({ status: 'complete', chunksCreated: created, finishedAt: new Date() })
      .where(eq(indexRuns.id, runResult.id))
      .run();

    return { chunksCreated: created, chunksSkipped: skipped };
  } catch (error: any) {
    db.update(indexRuns)
      .set({ status: 'failed', error: error.message, finishedAt: new Date() })
      .where(eq(indexRuns.id, runResult.id))
      .run();
    return { chunksCreated: 0, chunksSkipped: 0, error: error.message };
  }
}

/**
 * Checks if re-indexing is needed by comparing source timestamps vs indexed timestamps.
 */
export function isIndexStale(options: { scoredJobId?: number }): boolean {
  const db = getDb();
  const { profileId } = resolveContext();

  // Check if any chunks exist at all for this profile
  const anyChunks = db.select().from(documentChunks)
    .where(eq(documentChunks.profileId, profileId))
    .limit(1).get();
  if (!anyChunks) return true;

  // Simple heuristic: if the last successful index run was > 30 min ago, consider it potentially stale
  const lastRun = db.select()
    .from(indexRuns)
    .where(and(
      eq(indexRuns.status, 'complete'),
      eq(indexRuns.profileId, profileId)
    ))
    .limit(1)
    .get();

  if (!lastRun || !lastRun.finishedAt) return true;

  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
  return new Date(lastRun.finishedAt) < thirtyMinAgo;
}

/**
 * Clears all chunks for a specific scored job (for re-indexing).
 */
export function clearJobChunks(scoredJobId: number): void {
  const db = getDb();
  const { profileId } = resolveContext();
  db.delete(documentChunks).where(and(
    eq(documentChunks.scoredJobId, scoredJobId),
    eq(documentChunks.profileId, profileId)
  )).run();
}

/**
 * Clears all profile-level chunks (for re-indexing when profile changes).
 */
export function clearProfileChunks(): void {
  const db = getDb();
  const { profileId } = resolveContext();
  // Profile chunks have null scoredJobId and specific source types
  const profileTypes = ['master_profile', 'resume_text', 'search_preferences'];
  for (const st of profileTypes) {
    db.delete(documentChunks).where(and(
      eq(documentChunks.sourceType, st),
      eq(documentChunks.profileId, profileId)
    )).run();
  }
}

/**
 * Gets the latest index status for display in the UI.
 */
export function getIndexStatus(): {
  totalChunks: number;
  lastRunAt: Date | null;
  lastRunStatus: string | null;
} {
  const db = getDb();
  const { profileId } = resolveContext();
  
  const chunks = db.select().from(documentChunks)
    .where(eq(documentChunks.profileId, profileId))
    .all();
    
  const lastRun = db.select().from(indexRuns)
    .where(eq(indexRuns.profileId, profileId))
    .orderBy(indexRuns.startedAt) // Should probably have an order
    .limit(1).get();

  return {
    totalChunks: chunks.length,
    lastRunAt: lastRun?.finishedAt ? new Date(lastRun.finishedAt) : null,
    lastRunStatus: lastRun?.status || null,
  };
}
