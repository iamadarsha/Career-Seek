'use server';

import { getDb } from '../../db';
import { 
  documentAssets, 
  applications, 
  scoredJobs, 
  normalizedJobs,
  jdAnalyses,
  masterProfiles,
} from '../../db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { resolveContext } from '../../lib/platform/identity';
import { analyzeJd } from '../../lib/services/documents/analysis';
import { tailorResume, type TailoredResume } from '../../lib/services/documents/resume-tailor';
import { buildResumeDocx, buildResumePdf, buildTextPdf } from '../../lib/services/documents/docx-builder';
import { verifyAtsFit, type AtsReport } from '../../lib/services/documents/ats';
import { generateCoverLetter } from '../../lib/services/documents/cover-letter';
import { generateOutreachNote } from '../../lib/services/documents/outreach';
import { buildKeywordCoverageReport, buildSectionRecommendations } from '../../lib/services/documents/keyword-coverage';
import { writeAtsSidecarArtifacts } from '../../lib/ats/builder';
import { createFromScoredJob, changeStatus } from '../../lib/services/crm/application-service';
import { getAppSubDir } from '../../lib/local-paths';
import { assetBelongsToCurrentMasterProfile } from '../../lib/services/documents/asset-filters';
import { safeAiErrorMessage } from '../../lib/services/gemini';
import { indexDocuments } from '../../lib/services/coach/embedder';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

function getLatestMasterProfileId(profileId: number) {
  const db = getDb();
  const latest = db.select({ id: masterProfiles.id })
    .from(masterProfiles)
    .where(eq(masterProfiles.profileId, profileId))
    .orderBy(desc(masterProfiles.updatedAt), desc(masterProfiles.id))
    .get();

  if (!latest) {
    throw new Error('No resume-derived master profile found. Upload and confirm your resume profile before generating documents.');
  }

  return latest.id;
}

function hashJson(value: unknown) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
}

function safeFilePart(value: unknown, fallback: string) {
  return String(value || fallback).replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 48) || fallback;
}

function outputChildDir(parent: 'output/resumes' | 'output/cover-letters', child: string) {
  const dir = path.join(getAppSubDir(parent), child);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function formatList(values: string[] | undefined, empty = 'None') {
  return values?.length ? values.map((value) => `- ${value}`).join('\n') : `- ${empty}`;
}

function buildAtsReportText(
  atsReport: AtsReport,
  jobContext: typeof normalizedJobs.$inferSelect,
  resumeAssetId: number,
  pdfAssetId: number,
) {
  const recommendations = atsReport.sectionRecommendations?.length
    ? atsReport.sectionRecommendations.map((item) => `- ${item.section}: ${item.recommendation}`).join('\n')
    : '- No section-specific recommendations.';

  return [
    `ATS Advisory Report - ${jobContext.title} @ ${jobContext.company}`,
    `Score: ${atsReport.atsScore}% (${atsReport.verdict})`,
    'Advisory: This is a local keyword and section-coverage estimate, not an employer ATS result or guarantee.',
    atsReport.keywordScore != null ? `Keyword match: ${atsReport.keywordScore}%` : '',
    atsReport.semanticScore != null ? `Meaning match: ${atsReport.semanticScore}%` : '',
    atsReport.sectionScore != null ? `Resume coverage: ${atsReport.sectionScore}%` : '',
    atsReport.riskPenalty ? `Risk adjustment: -${Math.abs(atsReport.riskPenalty)} pts` : '',
    atsReport.semanticSummary ? `Meaning summary: ${atsReport.semanticSummary}` : '',
    '',
    'Matched Keywords',
    formatList(atsReport.keywordsFound),
    '',
    'Missing Or Weak Keywords',
    formatList(atsReport.keywordsMissing),
    '',
    'Strengths',
    formatList(atsReport.strengths),
    '',
    'Risks',
    formatList(atsReport.risks),
    '',
    'Section Recommendations',
    recommendations,
    '',
    atsReport.explanation ? `Explanation: ${atsReport.explanation}` : '',
    atsReport.provenance?.generationMode ? `Scoring method: ${atsReport.provenance.generationMode}` : '',
    `Linked resume asset: ${resumeAssetId}`,
    `Linked resume PDF asset: ${pdfAssetId}`,
  ].filter(Boolean).join('\n');
}

function buildLocalAtsReport(
  resume: TailoredResume,
  jdAnalysis: Awaited<ReturnType<typeof analyzeJd>>,
  jobContext: typeof normalizedJobs.$inferSelect,
  fallbackReason: string,
): AtsReport {
  const jd = jdAnalysis || {
    mustHaveSkills: [],
    preferredSkills: [],
    atsKeywords: [],
    domainLanguage: [],
    senioritySignals: [],
    leadershipSignals: [],
    toolRequirements: [],
    businessContext: '',
    hiringPriorities: '',
  };
  const keywordReport = buildKeywordCoverageReport(resume, jd);
  const atsScore = Math.max(35, Math.min(82, Math.round(42 + keywordReport.coveragePct * 0.48)));

  return {
    atsScore,
    keywordsFound: keywordReport.matched,
    keywordsMissing: keywordReport.missing,
    strengths: keywordReport.matched.length
      ? [`Generated resume includes ${keywordReport.matched.slice(0, 6).join(', ')} for ${jobContext.title} at ${jobContext.company}.`]
      : ['Generated resume preserves the selected profile facts, but keyword overlap is limited.'],
    risks: keywordReport.missing.length
      ? [`Missing or weak coverage for ${keywordReport.missing.slice(0, 6).join(', ')} in the generated resume.`]
      : [],
    sectionRecommendations: buildSectionRecommendations(keywordReport),
    verdict: atsScore >= 75 ? 'Strong Match' : atsScore >= 55 ? 'Moderate Match' : 'Weak Match',
    keywordReport,
    explanation: `Local ATS coverage estimate for the generated resume and selected ${jobContext.title} role at ${jobContext.company}. This is based on keyword placement in the generated document, not an employer ATS guarantee.`,
    provenance: {
      generationMode: 'local_profile_jd_fallback',
      fallbackReason,
    },
  };
}

async function refreshCoachIndexForJob(scoredJobId: number) {
  try {
    await indexDocuments({ includeProfile: true, scoredJobId, includeAllJobs: false, forceReindex: true });
  } catch (error) {
    console.warn(`Coach index refresh skipped for job ${scoredJobId}: ${safeAiErrorMessage(error)}`);
  }
}

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
  const { profileId } = resolveContext();

  const jobInfo = db.select()
    .from(scoredJobs)
    .innerJoin(normalizedJobs, eq(scoredJobs.normalizedJobId, normalizedJobs.id))
    .where(and(eq(scoredJobs.id, scoredJobId), eq(scoredJobs.profileId, profileId)))
    .get();

  if (!jobInfo) throw new Error("Job not found");

  const jdAnalysis = await analyzeJd(scoredJobId);
  if (!jdAnalysis) throw new Error("Failed to analyze JD");

  const masterProfileId = getLatestMasterProfileId(profileId);

  // Tailor Resume
  const resumeData = await tailorResume(
    masterProfileId,
    jdAnalysis, 
    jobInfo.normalized_jobs
  );
  if (!resumeData) throw new Error("Failed to tailor resume");

  // Get current version
  const latestResume = db.select()
    .from(documentAssets)
    .where(and(
      eq(documentAssets.profileId, profileId),
      eq(documentAssets.scoredJobId, scoredJobId),
      eq(documentAssets.type, 'resume'),
    ))
    .orderBy(desc(documentAssets.version))
    .get();
  const nextVersion = latestResume ? (latestResume.version || 1) + 1 : 1;
  const meta = {
    scoredJobId,
    normalizedJobId: jobInfo.normalized_jobs.id,
    masterProfileId,
    jdHash: hashJson(jdAnalysis),
    generatedResumeHash: hashJson(resumeData),
    selectedJobHash: hashJson({
      id: jobInfo.normalized_jobs.id,
      title: jobInfo.normalized_jobs.title,
      company: jobInfo.normalized_jobs.company,
      snippet: jobInfo.normalized_jobs.snippet,
    }),
    selectedJob: {
      title: jobInfo.normalized_jobs.title,
      company: jobInfo.normalized_jobs.company,
      location: jobInfo.normalized_jobs.location,
      url: jobInfo.normalized_jobs.url,
    },
    generatorVersion: 'career-seek-docs-v2',
    assetVersion: nextVersion,
    generatedAt: new Date().toISOString(),
  };

  // Build ATS-safe files from the same structured resume model.
  const filePath = await buildResumeDocx(resumeData, scoredJobId, {
    version: nextVersion,
    company: jobInfo.normalized_jobs.company,
    title: jobInfo.normalized_jobs.title,
  });
  const pdfPath = await buildResumePdf(resumeData, scoredJobId, {
    version: nextVersion,
    company: jobInfo.normalized_jobs.company,
    title: jobInfo.normalized_jobs.title,
  });
  const sidecars = await writeAtsSidecarArtifacts(resumeData, filePath, {
    version: String(nextVersion),
    source: 'Career Seek tailored resume pipeline',
    job: {
      id: scoredJobId,
      title: jobInfo.normalized_jobs.title,
      company: jobInfo.normalized_jobs.company,
    },
    basename: path.parse(filePath).name,
  });
  const documentMeta = {
    ...meta,
    sidecars: {
      plainTextPath: sidecars.plainTextPath,
      jsonResumePath: sidecars.jsonResumePath,
      freshResumePath: sidecars.freshResumePath,
      manifestPath: sidecars.manifestPath,
    },
    exportWarnings: sidecars.bundle.warnings,
  };

  // ATS Check
  let atsReport: AtsReport | null = null;
  try {
    atsReport = await verifyAtsFit(resumeData, jdAnalysis, jobInfo.normalized_jobs);
  } catch (error) {
    console.error(`Failed to verify ATS fit with the selected AI provider; using local generated-resume coverage: ${safeAiErrorMessage(error)}`);
    atsReport = buildLocalAtsReport(resumeData, jdAnalysis, jobInfo.normalized_jobs, safeAiErrorMessage(error));
  }
  if (!atsReport) {
    atsReport = buildLocalAtsReport(resumeData, jdAnalysis, jobInfo.normalized_jobs, 'ATS verifier returned no report.');
  }

  // Save Resume Asset
  const resumeAssetResult = db.insert(documentAssets).values({
    profileId,
    scoredJobId,
    type: 'resume',
    content: JSON.stringify({ ...resumeData, _meta: { ...documentMeta, format: 'docx', pdfPath } }),
    filePath,
    atsScore: atsReport?.atsScore,
    version: nextVersion,
    createdAt: new Date(),
  }).returning().get();

  const pdfAssetResult = db.insert(documentAssets).values({
    profileId,
    scoredJobId,
    type: 'resume_pdf',
    content: JSON.stringify({ ...resumeData, _meta: { ...documentMeta, format: 'pdf', docxPath: filePath } }),
    filePath: pdfPath,
    atsScore: atsReport?.atsScore,
    version: nextVersion,
    createdAt: new Date(),
  }).returning().get();

  const atsOutputDir = outputChildDir('output/resumes', 'ats-reports');
  const atsFilePath = path.join(
    atsOutputDir,
    `ats_report_${safeFilePart(jobInfo.normalized_jobs.company, 'company')}_${safeFilePart(jobInfo.normalized_jobs.title, 'role')}_job_${scoredJobId}_v${nextVersion}_${Date.now()}.txt`,
  );
  fs.writeFileSync(
    atsFilePath,
    buildAtsReportText(atsReport, jobInfo.normalized_jobs, resumeAssetResult.id, pdfAssetResult.id),
    'utf8',
  );

  // Save ATS Report Asset
  db.insert(documentAssets).values({
    profileId,
    scoredJobId,
    type: 'ats_report',
    content: JSON.stringify({
      ...atsReport,
      _meta: {
        ...documentMeta,
        format: 'ats_report',
        linkedResumeAssetId: resumeAssetResult.id,
        linkedPdfAssetId: pdfAssetResult.id,
        atsInputHash: hashJson({ resumeHash: meta.generatedResumeHash, jdHash: meta.jdHash, scoredJobId }),
        reportPath: atsFilePath,
      },
    }),
    filePath: atsFilePath,
    atsScore: atsReport.atsScore,
    version: nextVersion,
    createdAt: new Date(),
  }).run();

  await refreshCoachIndexForJob(scoredJobId);

  return { success: true, resumeId: resumeAssetResult.id, pdfResumeId: pdfAssetResult.id, filePath, pdfPath, atsReport };
}

export async function generateCoverLetterAction(scoredJobId: number) {
  const db = getDb();
  const { profileId } = resolveContext();
  
  const jobInfo = db.select()
    .from(scoredJobs)
    .innerJoin(normalizedJobs, eq(scoredJobs.normalizedJobId, normalizedJobs.id))
    .where(and(eq(scoredJobs.id, scoredJobId), eq(scoredJobs.profileId, profileId)))
    .get();

  if (!jobInfo) throw new Error("Job not found");

  const jdAnalysis = await analyzeJd(scoredJobId);
  if (!jdAnalysis) throw new Error("Failed to analyze JD");

  const content = await generateCoverLetter(getLatestMasterProfileId(profileId), jdAnalysis, jobInfo.normalized_jobs);
  if (!content) throw new Error("Failed to generate cover letter");

  const latest = db.select().from(documentAssets)
    .where(and(
      eq(documentAssets.profileId, profileId),
      eq(documentAssets.scoredJobId, scoredJobId),
      eq(documentAssets.type, 'cover_letter'),
    ))
    .orderBy(desc(documentAssets.version)).get();
  
  const nextVersion = latest ? (latest.version || 1) + 1 : 1;

  const outputDir = getAppSubDir('output/cover-letters');
  const safeCompany = safeFilePart(jobInfo.normalized_jobs.company, 'company');
  const filePath = path.join(outputDir, `cover_letter_${safeCompany}_${scoredJobId}_${Date.now()}.txt`);
  fs.writeFileSync(filePath, content, 'utf8');
  const pdfPath = path.join(outputDir, `cover_letter_${safeCompany}_${scoredJobId}_${Date.now()}.pdf`);
  await buildTextPdf(content.split(/\r?\n/), pdfPath);

  const coverAsset = db.insert(documentAssets).values({
    profileId,
    scoredJobId,
    type: 'cover_letter',
    content,
    filePath,
    version: nextVersion,
    createdAt: new Date(),
  }).returning().get();

  const coverPdfAsset = db.insert(documentAssets).values({
    profileId,
    scoredJobId,
    type: 'cover_letter_pdf',
    content,
    filePath: pdfPath,
    version: nextVersion,
    createdAt: new Date(),
  }).returning().get();

  await refreshCoachIndexForJob(scoredJobId);

  return { success: true, id: coverAsset.id, pdfId: coverPdfAsset.id, content, filePath, pdfPath };
}

export async function generateOutreachNoteAction(scoredJobId: number) {
  const db = getDb();
  const { profileId } = resolveContext();
  
  const jobInfo = db.select()
    .from(scoredJobs)
    .innerJoin(normalizedJobs, eq(scoredJobs.normalizedJobId, normalizedJobs.id))
    .where(and(eq(scoredJobs.id, scoredJobId), eq(scoredJobs.profileId, profileId)))
    .get();

  if (!jobInfo) throw new Error("Job not found");

  const jdAnalysis = await analyzeJd(scoredJobId);
  if (!jdAnalysis) throw new Error("Failed to analyze JD");

  const content = await generateOutreachNote(getLatestMasterProfileId(profileId), jdAnalysis, jobInfo.normalized_jobs);
  if (!content) throw new Error("Failed to generate outreach note");

  const latest = db.select().from(documentAssets)
    .where(and(
      eq(documentAssets.profileId, profileId),
      eq(documentAssets.scoredJobId, scoredJobId),
      eq(documentAssets.type, 'outreach_note'),
    ))
    .orderBy(desc(documentAssets.version)).get();
  
  const nextVersion = latest ? (latest.version || 1) + 1 : 1;

  const outputDir = outputChildDir('output/cover-letters', 'outreach-notes');
  const filePath = path.join(
    outputDir,
    `outreach_note_${safeFilePart(jobInfo.normalized_jobs.company, 'company')}_${scoredJobId}_${Date.now()}.txt`,
  );
  fs.writeFileSync(filePath, content, 'utf8');

  const outreachAsset = db.insert(documentAssets).values({
    profileId,
    scoredJobId,
    type: 'outreach_note',
    content,
    filePath,
    version: nextVersion,
    createdAt: new Date(),
  }).returning().get();

  await refreshCoachIndexForJob(scoredJobId);

  return { success: true, id: outreachAsset.id, content, filePath };
}

export async function toggleAppliedStatus(scoredJobId: number) {
  const db = getDb();
  const { profileId } = resolveContext();
  const existing = db.select().from(applications).where(and(eq(applications.scoredJobId, scoredJobId), eq(applications.profileId, profileId))).get();

  if (existing) {
    if (existing.status === 'applied') {
      return {
        success: true,
        applied: true,
        saved: false,
        status: existing.status,
        message: 'This job is already marked applied.',
      };
    } else {
      const updated = changeStatus(existing.id, 'applied');
      return { success: true, applied: true, saved: false, status: updated?.status || 'applied' };
    }
  } else {
    const app = createFromScoredJob(scoredJobId);
    const updated = changeStatus(app.id, 'applied');
    return { success: true, applied: true, saved: false, status: updated?.status || 'applied' };
  }
}

export async function toggleSavedStatus(scoredJobId: number) {
  const db = getDb();
  const { profileId } = resolveContext();
  const existing = db.select().from(applications).where(and(eq(applications.scoredJobId, scoredJobId), eq(applications.profileId, profileId))).get();

  if (existing?.status === 'applied') {
    return {
      success: true,
      saved: false,
      applied: true,
      status: existing.status,
      message: 'This job is already marked applied.',
    };
  }

  if (existing?.status === 'saved') {
    return {
      success: true,
      saved: true,
      applied: false,
      status: existing.status,
      message: 'This job is already saved.',
    };
  }

  if (existing) {
    const updated = changeStatus(existing.id, 'saved');
    return { success: true, saved: true, applied: false, status: updated?.status || 'saved' };
  }

  const app = createFromScoredJob(scoredJobId);
  return { success: true, saved: true, applied: false, status: app.status || 'saved' };
}

export async function getDocumentAssets(scoredJobId: number) {
  const db = getDb();
  const { profileId } = resolveContext();
  const latestMasterProfileId = getLatestMasterProfileId(profileId);
  const latestMasterProfile = db.select({ id: masterProfiles.id, fullName: masterProfiles.fullName, updatedAt: masterProfiles.updatedAt })
    .from(masterProfiles)
    .where(eq(masterProfiles.id, latestMasterProfileId))
    .get();
  const assets = db.select().from(documentAssets)
    .where(and(eq(documentAssets.scoredJobId, scoredJobId), eq(documentAssets.profileId, profileId)))
    .orderBy(desc(documentAssets.createdAt))
    .all();
  const app = db.select().from(applications).where(and(eq(applications.scoredJobId, scoredJobId), eq(applications.profileId, profileId))).get();
  const jdAnalysis = db.select({
    id: jdAnalyses.id,
    scoredJobId: jdAnalyses.scoredJobId,
    mustHaveSkills: jdAnalyses.mustHaveSkills,
    preferredSkills: jdAnalyses.preferredSkills,
    atsKeywords: jdAnalyses.atsKeywords,
    domainLanguage: jdAnalyses.domainLanguage,
    senioritySignals: jdAnalyses.senioritySignals,
    leadershipSignals: jdAnalyses.leadershipSignals,
    toolRequirements: jdAnalyses.toolRequirements,
    businessContext: jdAnalyses.businessContext,
    hiringPriorities: jdAnalyses.hiringPriorities,
    analyzedAt: jdAnalyses.analyzedAt,
  })
    .from(jdAnalyses)
    .innerJoin(scoredJobs, eq(jdAnalyses.scoredJobId, scoredJobs.id))
    .where(and(eq(jdAnalyses.scoredJobId, scoredJobId), eq(scoredJobs.profileId, profileId)))
    .get();
  
  return { 
    success: true, 
    assets: assets.filter((asset) => assetBelongsToCurrentMasterProfile(asset, latestMasterProfile)),
    isApplied: app?.status === 'applied',
    isSaved: app?.status === 'saved',
    applicationStatus: app?.status || null,
    appliedAt: app?.appliedAt,
    jdAnalysis
  };
}
