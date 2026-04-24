/**
 * Retrieval Engine — Phase F
 * 
 * Combines semantic (cosine similarity) and keyword-based retrieval
 * with metadata filtering by scope, job ID, and source type.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { getDb } from '../../../db';
import { documentChunks } from '../../../db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { getAppConfig } from '../../config';
import { resolveContext } from '../../platform/identity';

const EMBEDDING_MODEL = 'text-embedding-004';

// ── Types ──────────────────────────────────────────────────────────────────

export type RetrievalScope =
  | 'job_only'
  | 'job_and_profile'
  | 'job_and_resume'
  | 'all_materials'
  | 'profile_only';

export interface RetrievedChunk {
  chunkId: string;
  sourceType: string;
  sourceId: number | null;
  scoredJobId: number | null;
  section: string;
  content: string;
  metadata: Record<string, any>;
  relevanceScore: number; // 0-100
  sourceLabel: string; // human-readable label
}

export interface RetrievalResult {
  chunks: RetrievedChunk[];
  totalCandidates: number;
  retrievalTimeMs: number;
}

// ── Math helpers ───────────────────────────────────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dotProduct / denom;
}

function keywordOverlap(query: string, content: string): number {
  const queryTerms = new Set(query.toLowerCase().split(/\s+/).filter(t => t.length > 2));
  const contentLower = content.toLowerCase();
  let matches = 0;
  for (const term of queryTerms) {
    if (contentLower.includes(term)) matches++;
  }
  return queryTerms.size === 0 ? 0 : matches / queryTerms.size;
}

// ── Source label generator ─────────────────────────────────────────────────

function generateSourceLabel(chunk: { sourceType: string; section: string; metadata: Record<string, any>; scoredJobId: number | null }): string {
  const labels: Record<string, string> = {
    'master_profile': 'Your Profile',
    'resume_text': 'Uploaded Resume',
    'job_description': 'Job Description',
    'tailored_resume': 'Tailored Resume',
    'ats_report': 'ATS Report',
    'cover_letter': 'Cover Letter',
    'outreach_note': 'Outreach Note',
    'enrichment': 'AI Brief',
    'search_preferences': 'Search Preferences',
    'jd_analysis': 'JD Analysis',
  };

  let label = labels[chunk.sourceType] || chunk.sourceType;

  // Add section detail
  if (chunk.section.startsWith('experience_')) {
    const meta = chunk.metadata;
    label += ` — ${meta.role || 'Experience'} at ${meta.company || 'Company'}`;
  } else if (chunk.section.startsWith('project_')) {
    label += ` — Project: ${chunk.metadata.projectName || 'Unnamed'}`;
  } else if (chunk.section === 'skills') {
    label += ' — Skills';
  } else if (chunk.section === 'summary') {
    label += ' — Summary';
  } else if (chunk.section === 'achievements') {
    label += ' — Achievements';
  } else if (chunk.section === 'requirements') {
    label += ' — Requirements';
  } else if (chunk.section === 'context') {
    label += ' — Business Context';
  }

  // Add job context if present
  if (chunk.metadata.title && chunk.metadata.company) {
    label += ` (${chunk.metadata.title} @ ${chunk.metadata.company})`;
  }

  return label;
}

// ── Main retrieval function ────────────────────────────────────────────────

export async function retrieve(
  query: string,
  scope: RetrievalScope,
  scoredJobId: number | null,
  topK: number = 8,
): Promise<RetrievalResult> {
  const startTime = Date.now();
  const config = getAppConfig();
  
  if (!config.geminiApiKey) {
    return { chunks: [], totalCandidates: 0, retrievalTimeMs: 0 };
  }

  const db = getDb();
  const { profileId } = resolveContext();

  // 1. Embed the query
  const genAI = new GoogleGenerativeAI(config.geminiApiKey);
  const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
  
  let queryEmbedding: number[];
  try {
    const result = await model.embedContent(query);
    queryEmbedding = result.embedding.values;
  } catch (error) {
    console.error('Failed to embed query:', error);
    return { chunks: [], totalCandidates: 0, retrievalTimeMs: Date.now() - startTime };
  }

  // 2. Load candidate chunks based on scope
  let candidates: any[];

  switch (scope) {
    case 'job_only':
      if (!scoredJobId) {
        candidates = [];
      } else {
        candidates = db.select().from(documentChunks)
          .where(and(
            eq(documentChunks.scoredJobId, scoredJobId),
            eq(documentChunks.profileId, profileId)
          ))
          .all();
      }
      break;

    case 'job_and_profile':
      if (scoredJobId) {
        const jobChunks = db.select().from(documentChunks)
          .where(and(
            eq(documentChunks.scoredJobId, scoredJobId),
            eq(documentChunks.profileId, profileId)
          ))
          .all();
        const profileChunks = db.select().from(documentChunks)
          .where(and(
            isNull(documentChunks.scoredJobId),
            eq(documentChunks.profileId, profileId)
          ))
          .all();
        candidates = [...jobChunks, ...profileChunks];
      } else {
        candidates = db.select().from(documentChunks)
          .where(and(
            isNull(documentChunks.scoredJobId),
            eq(documentChunks.profileId, profileId)
          ))
          .all();
      }
      break;

    case 'job_and_resume':
      {
        const parts: any[] = [];
        if (scoredJobId) {
          parts.push(...db.select().from(documentChunks)
            .where(and(
              eq(documentChunks.scoredJobId, scoredJobId),
              eq(documentChunks.profileId, profileId)
            )).all());
        }
        // Also include tailored resume and profile resume
        parts.push(...db.select().from(documentChunks)
          .where(and(
            eq(documentChunks.sourceType, 'resume_text'),
            eq(documentChunks.profileId, profileId)
          )).all());
        parts.push(...db.select().from(documentChunks)
          .where(and(
            eq(documentChunks.sourceType, 'master_profile'),
            eq(documentChunks.profileId, profileId)
          )).all());
        if (scoredJobId) {
          parts.push(...db.select().from(documentChunks)
            .where(and(
              eq(documentChunks.sourceType, 'tailored_resume'),
              eq(documentChunks.scoredJobId, scoredJobId),
              eq(documentChunks.profileId, profileId)
            )).all());
        }
        // Deduplicate by chunkId
        const seen = new Set<string>();
        candidates = parts.filter(c => {
          if (seen.has(c.chunkId)) return false;
          seen.add(c.chunkId);
          return true;
        });
      }
      break;

    case 'all_materials':
      candidates = db.select().from(documentChunks)
        .where(eq(documentChunks.profileId, profileId))
        .all();
      break;

    case 'profile_only':
      candidates = db.select().from(documentChunks)
        .where(and(
          isNull(documentChunks.scoredJobId),
          eq(documentChunks.profileId, profileId)
        ))
        .all();
      break;

    default:
      candidates = db.select().from(documentChunks)
        .where(eq(documentChunks.profileId, profileId))
        .all();
  }

  if (candidates.length === 0) {
    return { chunks: [], totalCandidates: 0, retrievalTimeMs: Date.now() - startTime };
  }

  // 3. Score each candidate
  const scored: RetrievedChunk[] = candidates
    .map(chunk => {
      let embedding: number[];
      try {
        embedding = JSON.parse(chunk.embedding || '[]');
      } catch {
        embedding = [];
      }

      // Semantic score (0-1)
      const semanticScore = embedding.length > 0 ? cosineSimilarity(queryEmbedding, embedding) : 0;
      
      // Keyword boost (0-1)
      const keywordScore = keywordOverlap(query, chunk.content);
      
      // Combined score: 70% semantic + 30% keyword
      const combinedScore = Math.round((semanticScore * 0.7 + keywordScore * 0.3) * 100);

      const metadata = (() => {
        try { return JSON.parse(chunk.metadata || '{}'); } catch { return {}; }
      })();

      return {
        chunkId: chunk.chunkId,
        sourceType: chunk.sourceType,
        sourceId: chunk.sourceId,
        scoredJobId: chunk.scoredJobId,
        section: chunk.section,
        content: chunk.content,
        metadata,
        relevanceScore: combinedScore,
        sourceLabel: generateSourceLabel({ ...chunk, metadata }),
      };
    })
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, topK);

  return {
    chunks: scored,
    totalCandidates: candidates.length,
    retrievalTimeMs: Date.now() - startTime,
  };
}
