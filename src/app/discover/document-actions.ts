'use server';

import { getDb } from '../../db';
import { 
  documentAssets, 
  applications, 
  scoredJobs, 
  normalizedJobs,
  jdAnalyses
} from '../../db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { resolveContext } from '../../lib/platform/identity';
import { analyzeJd } from '../../lib/services/documents/analysis';
import { tailorResume } from '../../lib/services/documents/resume-tailor';
import { buildResumeDocx } from '../../lib/services/documents/docx-builder';
import { verifyAtsFit } from '../../lib/services/documents/ats';
import { generateCoverLetter } from '../../lib/services/documents/cover-letter';
import { generateOutreachNote } from '../../lib/services/documents/outreach';
import { createFromScoredJob, changeStatus } from '../../lib/services/crm/application-service';

/**
 * Gets or generates JD Analysis for a specific scored job.
 */
export async function getOrGenerateJdAnalysis(scoredJobId: number) {
  const analysis = await analyzeJd(scoredJobId);
  return { success: true, data: analysis };
}

/**
 * Full pipeline: JD Analysis -> Tailor Resume -> DOCX -> ATS Check -> Save
 */
export async function generateResumePipeline(scoredJobId: number) {
  const db = getDb();

  const jobInfo = db.select()
    .from(scoredJobs)
    .innerJoin(normalizedJobs, eq(scoredJobs.normalizedJobId, normalizedJobs.id))
    .where(eq(scoredJobs.id, scoredJobId))
    .get();

  if (!jobInfo) throw new Error("Job not found");

  const jdAnalysis = await analyzeJd(scoredJobId);
  if (!jdAnalysis) throw new Error("Failed to analyze JD");

  // Tailor Resume
  const resumeData = await tailorResume(
    jobInfo.scored_jobs.masterProfileId, 
    jdAnalysis, 
    jobInfo.normalized_jobs
  );
  if (!resumeData) throw new Error("Failed to tailor resume");

  // Build DOCX
  const filePath = await buildResumeDocx(resumeData, scoredJobId);

  // ATS Check
  const atsReport = await verifyAtsFit(resumeData, jdAnalysis, jobInfo.normalized_jobs);

  // Get current version
  const latestResume = db.select()
    .from(documentAssets)
    .where(and(eq(documentAssets.scoredJobId, scoredJobId), eq(documentAssets.type, 'resume')))
    .orderBy(desc(documentAssets.version))
    .get();
  const nextVersion = latestResume ? (latestResume.version || 1) + 1 : 1;

  // Save Resume Asset
  const resumeAssetResult = db.insert(documentAssets).values({
    scoredJobId,
    type: 'resume',
    content: JSON.stringify(resumeData),
    filePath,
    version: nextVersion,
    createdAt: new Date(),
  }).returning().get();

  // Save ATS Report Asset
  if (atsReport) {
    db.insert(documentAssets).values({
      scoredJobId,
      type: 'ats_report',
      content: JSON.stringify(atsReport),
      atsScore: atsReport.atsScore,
      version: nextVersion,
      createdAt: new Date(),
    }).run();
  }

  return { success: true, resumeId: resumeAssetResult.id, filePath, atsReport };
}

export async function generateCoverLetterAction(scoredJobId: number) {
  const db = getDb();
  
  const jobInfo = db.select()
    .from(scoredJobs)
    .innerJoin(normalizedJobs, eq(scoredJobs.normalizedJobId, normalizedJobs.id))
    .where(eq(scoredJobs.id, scoredJobId))
    .get();

  if (!jobInfo) throw new Error("Job not found");

  const jdAnalysis = await analyzeJd(scoredJobId);
  if (!jdAnalysis) throw new Error("Failed to analyze JD");

  const content = await generateCoverLetter(jobInfo.scored_jobs.masterProfileId, jdAnalysis, jobInfo.normalized_jobs);
  if (!content) throw new Error("Failed to generate cover letter");

  const latest = db.select().from(documentAssets)
    .where(and(eq(documentAssets.scoredJobId, scoredJobId), eq(documentAssets.type, 'cover_letter')))
    .orderBy(desc(documentAssets.version)).get();
  
  const nextVersion = latest ? (latest.version || 1) + 1 : 1;

  db.insert(documentAssets).values({
    scoredJobId,
    type: 'cover_letter',
    content,
    version: nextVersion,
    createdAt: new Date(),
  }).run();

  return { success: true, content };
}

export async function generateOutreachNoteAction(scoredJobId: number) {
  const db = getDb();
  
  const jobInfo = db.select()
    .from(scoredJobs)
    .innerJoin(normalizedJobs, eq(scoredJobs.normalizedJobId, normalizedJobs.id))
    .where(eq(scoredJobs.id, scoredJobId))
    .get();

  if (!jobInfo) throw new Error("Job not found");

  const jdAnalysis = await analyzeJd(scoredJobId);
  if (!jdAnalysis) throw new Error("Failed to analyze JD");

  const content = await generateOutreachNote(jobInfo.scored_jobs.masterProfileId, jdAnalysis, jobInfo.normalized_jobs);
  if (!content) throw new Error("Failed to generate outreach note");

  const latest = db.select().from(documentAssets)
    .where(and(eq(documentAssets.scoredJobId, scoredJobId), eq(documentAssets.type, 'outreach_note')))
    .orderBy(desc(documentAssets.version)).get();
  
  const nextVersion = latest ? (latest.version || 1) + 1 : 1;

  db.insert(documentAssets).values({
    scoredJobId,
    type: 'outreach_note',
    content,
    version: nextVersion,
    createdAt: new Date(),
  }).run();

  return { success: true, content };
}

export async function toggleAppliedStatus(scoredJobId: number) {
  const db = getDb();
  const { profileId } = resolveContext();
  const existing = db.select().from(applications).where(and(eq(applications.scoredJobId, scoredJobId), eq(applications.profileId, profileId))).get();

  if (existing) {
    if (existing.status === 'applied') {
      changeStatus(existing.id, 'saved');
      return { success: true, applied: false };
    } else {
      changeStatus(existing.id, 'applied');
      return { success: true, applied: true };
    }
  } else {
    const app = createFromScoredJob(scoredJobId);
    changeStatus(app.id, 'applied');
    return { success: true, applied: true };
  }
}

export async function getDocumentAssets(scoredJobId: number) {
  const db = getDb();
  const { profileId } = resolveContext();
  const assets = db.select().from(documentAssets).where(eq(documentAssets.scoredJobId, scoredJobId)).orderBy(desc(documentAssets.createdAt)).all();
  const app = db.select().from(applications).where(and(eq(applications.scoredJobId, scoredJobId), eq(applications.profileId, profileId))).get();
  const jdAnalysis = db.select().from(jdAnalyses).where(eq(jdAnalyses.scoredJobId, scoredJobId)).get();
  
  return { 
    success: true, 
    assets,
    isApplied: app?.status === 'applied',
    appliedAt: app?.appliedAt,
    jdAnalysis
  };
}
