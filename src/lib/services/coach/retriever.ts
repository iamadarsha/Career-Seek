/**
 * Retrieval Engine - Phase F
 *
 * Combines semantic (cosine similarity) and keyword-based retrieval
 * with metadata filtering by scope, job ID, and source type.
 */

import { getDb } from '../../../db';
import { documentChunks, masterProfiles, normalizedJobs, scoredJobs, uploadedResumes } from '../../../db/schema';
import { desc, eq, and, isNull } from 'drizzle-orm';
import { resolveContext } from '../../platform/identity';
import { isValidationJob, shouldHideValidationJob } from '../documents/asset-filters';
import { embedCoachTexts } from './embedder';

const MIN_RELEVANCE_SCORE = Number(process.env.JOBHUNT_RAG_MIN_RELEVANCE || 18);
const USEFUL_FALLBACK_SCORE = Math.max(10, MIN_RELEVANCE_SCORE - 8);
const STOP_WORDS = new Set([
  'about', 'after', 'again', 'against', 'also', 'and', 'are', 'can', 'could', 'for', 'from',
  'have', 'how', 'into', 'job', 'more', 'role', 'should', 'that', 'the', 'this', 'what',
  'when', 'where', 'which', 'with', 'would', 'you', 'your',
]);

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

function normalizeTerm(term: string): string {
  return term
    .toLowerCase()
    .replace(/[^a-z0-9+#.-]/g, '')
    .replace(/(ing|ed|es|s)$/i, '');
}

function tokenize(text: string): string[] {
  return text
    .split(/\s+/)
    .map(normalizeTerm)
    .filter((term) => term.length > 2 && !STOP_WORDS.has(term));
}

function keywordOverlap(query: string, content: string): number {
  const queryTerms = new Set(expandQueryTerms(tokenize(query)));
  const contentTerms = new Set(tokenize(content));
  let matches = 0;
  for (const term of queryTerms) {
    if (contentTerms.has(term)) matches++;
  }
  return queryTerms.size === 0 ? 0 : matches / queryTerms.size;
}

const QUERY_EXPANSIONS: Record<string, string[]> = {
  ats: ['keyword', 'screen', 'parser', 'resume'],
  cv: ['resume'],
  resume: ['cv', 'profile', 'bullet', 'achievement'],
  interview: ['screen', 'question', 'story', 'example', 'prepare'],
  outreach: ['recruiter', 'message', 'linkedin', 'connect'],
  follow: ['followup', 'reminder', 'recruiter'],
  followup: ['follow', 'reminder', 'recruiter'],
  job: ['role', 'opening'],
  role: ['job', 'opening'],
  skill: ['tool', 'technology', 'keyword'],
  skills: ['tools', 'technologies', 'keywords'],
  product: ['pm', 'roadmap', 'prd'],
  manager: ['lead', 'owner', 'management'],
  ux: ['design', 'figma', 'prototype', 'research'],
  ui: ['design', 'frontend', 'figma'],
  rag: ['retrieval', 'embedding', 'llm'],
  llm: ['ai', 'genai', 'model'],
};

function expandQueryTerms(terms: string[]) {
  const expanded = new Set<string>();
  for (const term of terms) {
    expanded.add(term);
    for (const synonym of QUERY_EXPANSIONS[term] || []) expanded.add(normalizeTerm(synonym));
  }
  return Array.from(expanded);
}

function phraseScore(query: string, content: string) {
  const queryText = normalizeTextForPhrase(query);
  const contentText = normalizeTextForPhrase(content);
  const phrases = [
    ...queryText.match(/\b[a-z0-9+#.-]+\s+[a-z0-9+#.-]+\b/g) || [],
    ...queryText.match(/\b[a-z0-9+#.-]+\s+[a-z0-9+#.-]+\s+[a-z0-9+#.-]+\b/g) || [],
  ].filter((phrase) => phrase.length > 6);
  if (!phrases.length) return 0;
  const matched = phrases.filter((phrase) => contentText.includes(phrase)).length;
  return matched / phrases.length;
}

function normalizeTextForPhrase(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9+#.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildDocFrequency(candidates: any[]) {
  const docFreq = new Map<string, number>();
  for (const chunk of candidates) {
    const terms = new Set(tokenize(String(chunk.content || '')));
    for (const term of terms) {
      docFreq.set(term, (docFreq.get(term) || 0) + 1);
    }
  }
  return docFreq;
}

function lexicalHybridScore(query: string, content: string, docFreq: Map<string, number>, totalDocs: number) {
  const queryTerms = expandQueryTerms(tokenize(query));
  if (!queryTerms.length) return 0;
  const contentTerms = tokenize(content);
  const termCounts = new Map<string, number>();
  for (const term of contentTerms) {
    termCounts.set(term, (termCounts.get(term) || 0) + 1);
  }

  let weightedMatches = 0;
  let possible = 0;
  for (const term of queryTerms) {
    const df = docFreq.get(term) || 0;
    const idf = Math.log(1 + (totalDocs + 1) / (df + 1));
    possible += idf;
    const tf = termCounts.get(term) || 0;
    if (tf > 0) weightedMatches += idf * Math.min(1, 0.55 + Math.log1p(tf) / 2.5);
  }

  const weightedOverlap = possible > 0 ? weightedMatches / possible : 0;
  return Math.min(1, weightedOverlap * 0.8 + phraseScore(query, content) * 0.2);
}

function rankMap<T extends { chunkId: string }>(items: T[], score: (item: T) => number) {
  const map = new Map<string, number>();
  [...items]
    .sort((a, b) => score(b) - score(a))
    .forEach((item, index) => map.set(item.chunkId, index + 1));
  return map;
}

function reciprocalRankScore(rank: number | undefined) {
  return rank ? 1 / (60 + rank) : 0;
}

function sourceQualityBoost(sourceType: string) {
  if (['jd_analysis', 'ats_report', 'master_profile', 'tailored_resume'].includes(sourceType)) return 0.04;
  if (['job_description', 'resume_text', 'enrichment'].includes(sourceType)) return 0.03;
  if (['application_history', 'search_preferences'].includes(sourceType)) return 0.02;
  return 0;
}

function sourceIntentBoost(query: string, chunk: { sourceType: string; section: string; scoredJobId: number | null }): number {
  const q = query.toLowerCase();
  let boost = 0;

  if (/\b(fit|match|apply|application|risk|gap|strength|weak|background)\b/.test(q)) {
    if (['jd_analysis', 'enrichment', 'job_description'].includes(chunk.sourceType)) boost += 0.06;
    if (['master_profile', 'resume_text', 'tailored_resume', 'ats_report'].includes(chunk.sourceType)) boost += 0.05;
  }

  if (/\b(interview|screen|question|prepare|story|example)\b/.test(q)) {
    if (['jd_analysis', 'job_description', 'enrichment'].includes(chunk.sourceType)) boost += 0.08;
    if (['master_profile', 'resume_text', 'tailored_resume'].includes(chunk.sourceType)) boost += 0.04;
  }

  if (/\b(resume|cv|ats|keyword|tailor|bullet|project|skill)\b/.test(q)) {
    if (['ats_report', 'jd_analysis', 'tailored_resume', 'resume_text', 'master_profile'].includes(chunk.sourceType)) boost += 0.08;
  }

  if (/\b(ux|ui|designer|design|portfolio|case study|wireframe|prototype|figma|research|usability|interaction)\b/.test(q)) {
    if (['job_description', 'jd_analysis', 'enrichment'].includes(chunk.sourceType)) boost += 0.06;
    if (['master_profile', 'resume_text', 'tailored_resume', 'ats_report'].includes(chunk.sourceType)) boost += 0.06;
  }

  if (/\b(aml|kyc|compliance|sanction|financial crime|transaction monitoring|regulatory|cdd|edd|rbi)\b/.test(q)) {
    if (['job_description', 'jd_analysis', 'enrichment'].includes(chunk.sourceType)) boost += 0.06;
    if (['master_profile', 'resume_text', 'tailored_resume', 'ats_report'].includes(chunk.sourceType)) boost += 0.05;
  }

  if (/\b(follow.?up|pipeline|status|saved|applied|recruiter|outreach|message)\b/.test(q)) {
    if (['application_history', 'outreach_note', 'cover_letter'].includes(chunk.sourceType)) boost += 0.08;
  }

  if (chunk.section === 'overview' && /\b(role|job|company|salary|location|apply)\b/.test(q)) {
    boost += 0.04;
  }

  return Math.min(boost, 0.16);
}

function needsJobAndCandidateEvidence(query: string, scope: RetrievalScope, scoredJobId: number | null): boolean {
  if (!scoredJobId) return false;
  if (!['job_and_profile', 'job_and_resume', 'all_materials'].includes(scope)) return false;
  return /\b(fit|match|apply|risk|gap|strength|weak|background|interview|prepare|ats|resume|cv)\b/i.test(query);
}

function needsApplicationEvidence(query: string): boolean {
  return /\b(follow.?up|pipeline|status|saved|applied|recruiter|outreach|message|next)\b/i.test(query);
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
    'application_history': 'Application History',
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
  const db = getDb();
  const { profileId } = resolveContext();

  // 1. Embed the query
  let queryEmbedding: number[] | null = null;
  try {
    const [embedding] = await embedCoachTexts([query]);
    queryEmbedding = embedding;
  } catch (error) {
    console.error('Failed to embed query locally:', error);
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

  const currentProfile = db.select({ id: masterProfiles.id })
    .from(masterProfiles)
    .where(eq(masterProfiles.profileId, profileId))
    .orderBy(desc(masterProfiles.updatedAt), desc(masterProfiles.id))
    .limit(1)
    .get();

  const currentResume = db.select({ id: uploadedResumes.id })
    .from(uploadedResumes)
    .where(eq(uploadedResumes.profileId, profileId))
    .orderBy(desc(uploadedResumes.uploadedAt), desc(uploadedResumes.id))
    .limit(1)
    .get();

  const validationScoredJobIds = new Set(
    db.select({
      id: scoredJobs.id,
      portal: normalizedJobs.portal,
      title: normalizedJobs.title,
      company: normalizedJobs.company,
    })
      .from(scoredJobs)
      .innerJoin(normalizedJobs, eq(scoredJobs.normalizedJobId, normalizedJobs.id))
      .where(eq(scoredJobs.profileId, profileId))
      .all()
      .filter((job) => isValidationJob(job))
      .map((job) => job.id),
  );

  const docFreq = buildDocFrequency(candidates);

  // 3. Score each candidate with local hybrid retrieval:
  // semantic hash/vector similarity + BM25-lite lexical relevance + intent/source boosts.
  type CandidateScore = RetrievedChunk & {
    semanticRaw: number;
    lexicalRaw: number;
    intentRaw: number;
    baseRaw: number;
  };

  const candidateScores: CandidateScore[] = candidates
    .map(chunk => {
      let embedding: number[];
      try {
        embedding = JSON.parse(chunk.embedding || '[]');
      } catch {
        embedding = [];
      }

      const semanticScore = queryEmbedding && embedding.length > 0 ? cosineSimilarity(queryEmbedding, embedding) : 0;
      const keywordScore = Math.max(
        keywordOverlap(query, chunk.content),
        lexicalHybridScore(query, chunk.content, docFreq, candidates.length),
      );
      const intentBoost = sourceIntentBoost(query, chunk);

      const combined = queryEmbedding
        ? (semanticScore * 0.48 + keywordScore * 0.38 + intentBoost + sourceQualityBoost(chunk.sourceType))
        : (keywordScore * 0.82 + intentBoost + sourceQualityBoost(chunk.sourceType));

      const metadata = (() => {
        try { return JSON.parse(chunk.metadata || '{}'); } catch { return {}; }
      })();

      if (
        shouldHideValidationJob(metadata) ||
        (chunk.scoredJobId && validationScoredJobIds.has(chunk.scoredJobId)) ||
        (chunk.sourceType === 'master_profile' && currentProfile && Number(chunk.sourceId) !== currentProfile.id) ||
        (chunk.sourceType === 'resume_text' && currentResume && Number(chunk.sourceId) !== currentResume.id)
      ) {
        return null;
      }

      return {
        chunkId: chunk.chunkId,
        sourceType: chunk.sourceType,
        sourceId: chunk.sourceId,
        scoredJobId: chunk.scoredJobId,
        section: chunk.section,
        content: chunk.content,
        metadata,
        relevanceScore: 0,
        sourceLabel: generateSourceLabel({ ...chunk, metadata }),
        semanticRaw: semanticScore,
        lexicalRaw: keywordScore,
        intentRaw: intentBoost + sourceQualityBoost(chunk.sourceType),
        baseRaw: Math.max(0, Math.min(1, combined)),
      };
    })
    .filter((chunk): chunk is CandidateScore => chunk !== null);

  const semanticRanks = rankMap(candidateScores, (chunk) => chunk.semanticRaw);
  const lexicalRanks = rankMap(candidateScores, (chunk) => chunk.lexicalRaw);
  const baseRanks = rankMap(candidateScores, (chunk) => chunk.baseRaw);
  const maxRrf = reciprocalRankScore(1) * 3;

  const scoredCandidates: RetrievedChunk[] = candidateScores
    .map((chunk) => {
      const rrf = reciprocalRankScore(semanticRanks.get(chunk.chunkId)) +
        reciprocalRankScore(lexicalRanks.get(chunk.chunkId)) +
        reciprocalRankScore(baseRanks.get(chunk.chunkId));
      const rankBoost = maxRrf > 0 ? (rrf / maxRrf) * 0.12 : 0;
      return {
        ...chunk,
        relevanceScore: Math.round(Math.max(0, Math.min(1, chunk.baseRaw + rankBoost)) * 100),
      };
    })
    .sort((a, b) => b.relevanceScore - a.relevanceScore);

  const selected: RetrievedChunk[] = [];
  const sourceTypeCounts = new Map<string, number>();
  const pushUnique = (chunk: RetrievedChunk | undefined, force = false) => {
    if (!chunk || selected.some((existing) => existing.chunkId === chunk.chunkId)) return;
    const count = sourceTypeCounts.get(chunk.sourceType) || 0;
    if (!force && count >= 3 && selected.length < topK - 1) return;
    selected.push(chunk);
    sourceTypeCounts.set(chunk.sourceType, count + 1);
  };

  if (needsJobAndCandidateEvidence(query, scope, scoredJobId)) {
    pushUnique(scoredCandidates.find((chunk) =>
      chunk.relevanceScore >= USEFUL_FALLBACK_SCORE &&
      chunk.scoredJobId === scoredJobId &&
      ['job_description', 'jd_analysis', 'enrichment'].includes(chunk.sourceType)
    ), true);
    pushUnique(scoredCandidates.find((chunk) =>
      chunk.relevanceScore >= USEFUL_FALLBACK_SCORE &&
      ['master_profile', 'resume_text', 'tailored_resume', 'ats_report'].includes(chunk.sourceType)
    ), true);
  }

  if (needsApplicationEvidence(query)) {
    pushUnique(scoredCandidates.find((chunk) =>
      chunk.relevanceScore >= USEFUL_FALLBACK_SCORE &&
      chunk.sourceType === 'application_history'
    ), true);
  }

  for (const chunk of scoredCandidates) {
    if (chunk.relevanceScore < MIN_RELEVANCE_SCORE) continue;
    pushUnique(chunk);
    if (selected.length >= topK) break;
  }

  if (selected.length < topK) {
    for (const chunk of scoredCandidates) {
      if (chunk.relevanceScore < MIN_RELEVANCE_SCORE) continue;
      pushUnique(chunk, true);
      if (selected.length >= topK) break;
    }
  }

  const scored = selected.slice(0, topK);

  return {
    chunks: scored,
    totalCandidates: candidates.length,
    retrievalTimeMs: Date.now() - startTime,
  };
}
