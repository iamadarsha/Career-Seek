/**
 * Embedding & Indexing Service - Phase F
 *
 * Uses deterministic local embeddings so the Coach index works without a cloud
 * AI key and stays stable across provider changes.
 */

import { getDb } from '../../../db';
import { documentChunks, indexRuns } from '../../../db/schema';
import { desc, eq, and } from 'drizzle-orm';
import { RawChunk, generateChunks } from './chunker';
import { resolveContext } from '../../platform/identity';
import { createDefaultLocalResumeEmbeddingProvider, DEFAULT_LOCAL_RESUME_EMBEDDING_DIMENSIONS } from '../resume/embeddings';

const LOCAL_EMBEDDING_PROVIDER = createDefaultLocalResumeEmbeddingProvider();
const EMBEDDING_PROVIDER = LOCAL_EMBEDDING_PROVIDER.mode;
const EMBEDDING_MODEL = LOCAL_EMBEDDING_PROVIDER.id;
const EMBEDDING_DIMENSIONS = LOCAL_EMBEDDING_PROVIDER.dimensions || DEFAULT_LOCAL_RESUME_EMBEDDING_DIMENSIONS;
const PROFILE_SOURCE_TYPES = new Set(['master_profile', 'resume_text', 'search_preferences', 'application_history']);

// ── Core embedding function ────────────────────────────────────────────────

function parseEmbedding(raw: string | null | undefined): number[] {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed.filter((n) => typeof n === 'number') : [];
  } catch {
    return [];
  }
}

function parseMetadata(raw: string | null | undefined): Record<string, any> {
  try {
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function buildEmbeddingMetadata(metadata: Record<string, any> = {}) {
  return {
    ...metadata,
    embeddingProvider: EMBEDDING_PROVIDER,
    embeddingModel: EMBEDDING_MODEL,
    embeddingDimensions: EMBEDDING_DIMENSIONS,
    embeddingGeneratedAt: new Date().toISOString(),
  };
}

function hasUsableEmbedding(raw: string | null | undefined): boolean {
  const embedding = parseEmbedding(raw);
  return embedding.length === EMBEDDING_DIMENSIONS && embedding.some((value) => value !== 0);
}

export async function embedCoachTexts(texts: string[]): Promise<Array<number[] | null>> {
  try {
    const embeddings = await LOCAL_EMBEDDING_PROVIDER.embed(texts);
    return embeddings.map((embedding) =>
      embedding.vector.length === EMBEDDING_DIMENSIONS ? embedding.vector : null
    );
  } catch (error: any) {
    console.error(`Local embedding failed: ${error.message}`);
    return texts.map(() => null);
  }
}

// ── Indexing pipeline ──────────────────────────────────────────────────────

export interface IndexOptions {
  includeProfile?: boolean;
  scoredJobId?: number;
  includeAllJobs?: boolean;
  forceReindex?: boolean;
}

function isChunkInIndexScope(chunk: { sourceType: string; scoredJobId: number | null }, options: IndexOptions): boolean {
  if (PROFILE_SOURCE_TYPES.has(chunk.sourceType) || chunk.scoredJobId === null) {
    return options.includeProfile !== false;
  }
  if (options.scoredJobId) {
    return chunk.scoredJobId === options.scoredJobId;
  }
  return Boolean(options.includeAllJobs);
}

function pruneStaleChunks(rawChunks: RawChunk[], options: IndexOptions, profileId: number): number {
  if (!options.forceReindex) return 0;

  const db = getDb();
  const currentIds = new Set(rawChunks.map((chunk) => chunk.chunkId));
  const existing = db.select()
    .from(documentChunks)
    .where(eq(documentChunks.profileId, profileId))
    .all();

  let pruned = 0;
  for (const chunk of existing) {
    if (!isChunkInIndexScope(chunk, options) || currentIds.has(chunk.chunkId)) continue;
    db.delete(documentChunks).where(eq(documentChunks.id, chunk.id)).run();
    pruned++;
  }
  return pruned;
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
    pruneStaleChunks(rawChunks, options, profileId);
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

      if (existing && !options.forceReindex && hasUsableEmbedding(existing.embedding)) {
        skipped++;
        continue;
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
    const embeddings = await embedCoachTexts(texts);

    // Persist chunks with embeddings
    let failed = 0;

    for (let i = 0; i < chunksToProcess.length; i++) {
      const chunk = chunksToProcess[i];
      const embedding = embeddings[i];

      if (!embedding || embedding.length === 0) {
        failed++;
        continue;
      }

      const row = {
        profileId,
        chunkId: chunk.chunkId,
        sourceType: chunk.sourceType,
        sourceId: chunk.sourceId,
        scoredJobId: chunk.scoredJobId,
        section: chunk.section,
        content: chunk.content,
        metadata: JSON.stringify(buildEmbeddingMetadata(chunk.metadata)),
        embedding: JSON.stringify(embedding),
        tokenCount: Math.ceil(chunk.content.split(/\s+/).length * 1.3),
        indexedAt: new Date(),
      };

      const existing = db.select()
        .from(documentChunks)
        .where(and(
          eq(documentChunks.chunkId, chunk.chunkId),
          eq(documentChunks.profileId, profileId)
        ))
        .get();

      if (existing) {
        db.update(documentChunks)
          .set(row)
          .where(eq(documentChunks.id, existing.id))
          .run();
      } else {
        db.insert(documentChunks).values(row).run();
      }
      created++;
    }

    if (created === 0 && failed > 0) {
      const message = `${failed} chunks could not be embedded with the local embedding model`;
      db.update(indexRuns)
        .set({ status: 'failed', chunksCreated: 0, error: message, finishedAt: new Date() })
        .where(eq(indexRuns.id, runResult.id))
        .run();
      return { chunksCreated: 0, chunksSkipped: skipped, error: message };
    }

    // Update index run
    db.update(indexRuns)
      .set({
        status: 'complete',
        chunksCreated: created,
        error: failed > 0 ? `${failed} chunks could not be embedded with the local embedding model` : null,
        finishedAt: new Date(),
      })
      .where(eq(indexRuns.id, runResult.id))
      .run();

    return {
      chunksCreated: created,
      chunksSkipped: skipped,
      error: failed > 0 ? `${failed} chunks could not be embedded with the local embedding model` : undefined,
    };
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

  const staleScope: IndexOptions = {
    includeProfile: true,
    scoredJobId: options.scoredJobId,
  };
  const incompatibleChunk = db.select().from(documentChunks)
    .where(eq(documentChunks.profileId, profileId))
    .all()
    .some((chunk) => {
      if (!isChunkInIndexScope(chunk, staleScope)) return false;
      const metadata = parseMetadata(chunk.metadata);
      return !hasUsableEmbedding(chunk.embedding) ||
        metadata.embeddingDimensions !== EMBEDDING_DIMENSIONS ||
        metadata.embeddingModel !== EMBEDDING_MODEL;
    });
  if (incompatibleChunk) return true;

  // Simple heuristic: if the last successful index run was > 30 min ago, consider it potentially stale
  const lastRun = db.select()
    .from(indexRuns)
    .where(and(
      eq(indexRuns.status, 'complete'),
      eq(indexRuns.profileId, profileId)
    ))
    .orderBy(desc(indexRuns.finishedAt))
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
  const profileTypes = ['master_profile', 'resume_text', 'search_preferences', 'application_history'];
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
    .orderBy(desc(indexRuns.startedAt))
    .limit(1).get();

  return {
    totalChunks: chunks.length,
    lastRunAt: lastRun?.finishedAt ? new Date(lastRun.finishedAt) : null,
    lastRunStatus: lastRun?.status || null,
  };
}
