import { getDb } from '@/db';
import {
  documentAssets,
  applicationDocuments,
  applications,
  scoredJobs,
  normalizedJobs,
} from '@/db/schema';
import {
  eq,
  and,
  gte,
  lte,
  isNotNull,
  inArray,
  isNull,
  sql,
} from 'drizzle-orm';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AtsDistribution {
  range: '0-49' | '50-69' | '70-84' | '85-100';
  count: number;
  pct: number;
}

export interface DocumentUsageStat {
  type: 'resume' | 'cover_letter' | 'outreach_note';
  totalCreated: number;
  linkedToApplications: number;
  applicationRate: number; // 0-100
}

export interface AtsVsOutcome {
  band: '0-49' | '50-69' | '70-84' | '85-100';
  applicationCount: number;
  replyCount: number;
  interviewCount: number;
  replyRate: number;    // 0-100
  interviewRate: number; // 0-100
}

export interface HighAtsJob {
  scoredJobId: number;
  title: string;
  company: string;
  atsScore: number;
  tier: string;
}

export interface DocumentSummary {
  totalResumes: number;
  totalCoverLetters: number;
  totalOutreachNotes: number;
  avgAtsScore: number | null;
  highAtsUnusedCount: number;
  resumeApplicationRate: number; // 0-100
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

type AtsBand = '0-49' | '50-69' | '70-84' | '85-100';

function atsBand(score: number): AtsBand {
  if (score <= 49) return '0-49';
  if (score <= 69) return '50-69';
  if (score <= 84) return '70-84';
  return '85-100';
}

const ALL_BANDS: AtsBand[] = ['0-49', '50-69', '70-84', '85-100'];

// ─── getAtsDistribution ───────────────────────────────────────────────────────

export function getAtsDistribution(): AtsDistribution[] {
  const db = getDb();

  const rows = db
    .select({ atsScore: documentAssets.atsScore })
    .from(documentAssets)
    .where(
      and(
        eq(documentAssets.type, 'resume'),
        isNotNull(documentAssets.atsScore),
      ),
    )
    .all();

  if (rows.length === 0) {
    return ALL_BANDS.map((range) => ({ range, count: 0, pct: 0 }));
  }

  const counts: Record<AtsBand, number> = {
    '0-49': 0,
    '50-69': 0,
    '70-84': 0,
    '85-100': 0,
  };

  for (const row of rows) {
    if (row.atsScore !== null) {
      counts[atsBand(row.atsScore)]++;
    }
  }

  const total = rows.length;
  return ALL_BANDS.map((range) => ({
    range,
    count: counts[range],
    pct: total > 0 ? Math.round((counts[range] / total) * 100) : 0,
  }));
}

// ─── getDocumentUsageStats ────────────────────────────────────────────────────

export function getDocumentUsageStats(): DocumentUsageStat[] {
  const db = getDb();

  const types = ['resume', 'cover_letter', 'outreach_note'] as const;
  const result: DocumentUsageStat[] = [];

  for (const docType of types) {
    // Total created
    const totalRow = db
      .select({ cnt: sql<number>`count(*)` })
      .from(documentAssets)
      .where(eq(documentAssets.type, docType))
      .get();
    const totalCreated = totalRow?.cnt ?? 0;

    // Linked via applicationDocuments (distinct documentAssetId)
    const linkedRow = db
      .select({ cnt: sql<number>`count(distinct ${applicationDocuments.documentAssetId})` })
      .from(applicationDocuments)
      .where(eq(applicationDocuments.documentType, docType))
      .get();
    const linkedToApplications = linkedRow?.cnt ?? 0;

    result.push({
      type: docType,
      totalCreated,
      linkedToApplications,
      applicationRate:
        totalCreated > 0
          ? Math.round((linkedToApplications / totalCreated) * 100)
          : 0,
    });
  }

  return result;
}

// ─── getAtsVsOutcomes ─────────────────────────────────────────────────────────

export function getAtsVsOutcomes(): AtsVsOutcome[] {
  const db = getDb();

  // Pull resume-type applicationDocuments joined with their applications
  const rows = db
    .select({
      atsScore: applicationDocuments.atsScore,
      status: applications.status,
    })
    .from(applicationDocuments)
    .innerJoin(
      applications,
      eq(applicationDocuments.applicationId, applications.id),
    )
    .where(
      and(
        eq(applicationDocuments.documentType, 'resume'),
        isNotNull(applicationDocuments.atsScore),
      ),
    )
    .all();

  const replyStatuses = new Set([
    'recruiter_replied',
    'interview_scheduled',
    'interviewed',
    'offer',
  ]);
  const interviewStatuses = new Set([
    'interview_scheduled',
    'interviewed',
    'offer',
  ]);

  interface BandAccum {
    total: number;
    replies: number;
    interviews: number;
  }

  const accum: Record<AtsBand, BandAccum> = {
    '0-49':   { total: 0, replies: 0, interviews: 0 },
    '50-69':  { total: 0, replies: 0, interviews: 0 },
    '70-84':  { total: 0, replies: 0, interviews: 0 },
    '85-100': { total: 0, replies: 0, interviews: 0 },
  };

  for (const row of rows) {
    if (row.atsScore === null || row.status === null) continue;
    const band = atsBand(row.atsScore);
    accum[band].total++;
    if (replyStatuses.has(row.status)) accum[band].replies++;
    if (interviewStatuses.has(row.status)) accum[band].interviews++;
  }

  return ALL_BANDS.map((band) => {
    const { total, replies, interviews } = accum[band];
    return {
      band,
      applicationCount: total,
      replyCount: replies,
      interviewCount: interviews,
      replyRate: total > 0 ? Math.round((replies / total) * 100) : 0,
      interviewRate: total > 0 ? Math.round((interviews / total) * 100) : 0,
    };
  });
}

// ─── getHighAtsUnusedJobs ─────────────────────────────────────────────────────

export function getHighAtsUnusedJobs(minAts: number = 80): HighAtsJob[] {
  const db = getDb();

  // scoredJobIds that have at least one applied application
  const appliedRows = db
    .select({ scoredJobId: applications.scoredJobId })
    .from(applications)
    .where(isNotNull(applications.appliedAt))
    .all();

  const appliedScoredJobIds = appliedRows
    .map((r) => r.scoredJobId)
    .filter((id): id is number => id !== null);

  // documentAssets of type resume with high ATS, joined to scoredJobs + normalizedJobs
  const rows = db
    .select({
      scoredJobId: documentAssets.scoredJobId,
      atsScore: documentAssets.atsScore,
      tier: scoredJobs.tier,
      title: normalizedJobs.title,
      company: normalizedJobs.company,
    })
    .from(documentAssets)
    .innerJoin(scoredJobs, eq(documentAssets.scoredJobId, scoredJobs.id))
    .innerJoin(normalizedJobs, eq(scoredJobs.normalizedJobId, normalizedJobs.id))
    .where(
      and(
        eq(documentAssets.type, 'resume'),
        isNotNull(documentAssets.atsScore),
        gte(documentAssets.atsScore, minAts),
      ),
    )
    .all();

  const appliedSet = new Set(appliedScoredJobIds);

  return rows
    .filter((r) => !appliedSet.has(r.scoredJobId))
    .map((r) => ({
      scoredJobId: r.scoredJobId,
      title: r.title,
      company: r.company,
      atsScore: r.atsScore as number,
      tier: r.tier,
    }));
}

// ─── getDocumentSummary ───────────────────────────────────────────────────────

export function getDocumentSummary(): DocumentSummary {
  const db = getDb();

  const countByType = (type: string): number => {
    const row = db
      .select({ cnt: sql<number>`count(*)` })
      .from(documentAssets)
      .where(eq(documentAssets.type, type))
      .get();
    return row?.cnt ?? 0;
  };

  const totalResumes = countByType('resume');
  const totalCoverLetters = countByType('cover_letter');
  const totalOutreachNotes = countByType('outreach_note');

  // Average ATS score across resumes with a score
  const avgRow = db
    .select({ avg: sql<number | null>`avg(${documentAssets.atsScore})` })
    .from(documentAssets)
    .where(
      and(
        eq(documentAssets.type, 'resume'),
        isNotNull(documentAssets.atsScore),
      ),
    )
    .get();
  const avgAtsScore =
    avgRow?.avg !== null && avgRow?.avg !== undefined
      ? Math.round(avgRow.avg)
      : null;

  const highAtsUnusedCount = getHighAtsUnusedJobs(80).length;

  // Resume application rate: distinct assets linked / total assets
  const linkedRow = db
    .select({ cnt: sql<number>`count(distinct ${applicationDocuments.documentAssetId})` })
    .from(applicationDocuments)
    .where(eq(applicationDocuments.documentType, 'resume'))
    .get();
  const linkedResumes = linkedRow?.cnt ?? 0;
  const resumeApplicationRate =
    totalResumes > 0 ? Math.round((linkedResumes / totalResumes) * 100) : 0;

  return {
    totalResumes,
    totalCoverLetters,
    totalOutreachNotes,
    avgAtsScore,
    highAtsUnusedCount,
    resumeApplicationRate,
  };
}
