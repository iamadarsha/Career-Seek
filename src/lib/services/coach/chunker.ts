/**
 * Chunking Pipeline — Phase F
 * 
 * Section-aware chunker that converts structured app data
 * into indexable text chunks with stable IDs and provenance.
 */

import crypto from 'crypto';
import { getDb } from '../../../db';
import {
  masterProfiles,
  uploadedResumes,
  searchProfiles,
  normalizedJobs,
  scoredJobs,
  jobEnrichments,
  jdAnalyses,
  documentAssets,
  documentChunks,
} from '../../../db/schema';
import { eq, and } from 'drizzle-orm';
import { resolveContext } from '../../platform/identity';

// ── Types ──────────────────────────────────────────────────────────────────

export type SourceType =
  | 'master_profile'
  | 'resume_text'
  | 'job_description'
  | 'tailored_resume'
  | 'ats_report'
  | 'cover_letter'
  | 'outreach_note'
  | 'enrichment'
  | 'search_preferences'
  | 'jd_analysis';

export interface RawChunk {
  chunkId: string;
  profileId: number;
  sourceType: SourceType;
  sourceId: number | null;
  scoredJobId: number | null;
  section: string;
  content: string;
  metadata: Record<string, any>;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function makeChunkId(sourceType: string, sourceId: number | null, section: string): string {
  const raw = `${sourceType}:${sourceId ?? 'global'}:${section}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 24);
}

function estimateTokens(text: string): number {
  return Math.ceil(text.split(/\s+/).length * 1.3);
}

function safeParseJson(val: string | null | undefined): any {
  if (!val) return null;
  try { return JSON.parse(val); } catch { return null; }
}

// ── Chunkers by source type ────────────────────────────────────────────────

function chunkMasterProfile(profile: any, profileId: number): RawChunk[] {
  const chunks: RawChunk[] = [];
  const id = profile.id;

  // Summary chunk
  if (profile.rawSummary) {
    chunks.push({
      chunkId: makeChunkId('master_profile', id, 'summary'),
      profileId,
      sourceType: 'master_profile',
      sourceId: id,
      scoredJobId: null,
      section: 'summary',
      content: `Professional Summary: ${profile.rawSummary}`,
      metadata: { fullName: profile.fullName },
    });
  }

  // Headline + identity
  if (profile.headline || profile.fullName) {
    chunks.push({
      chunkId: makeChunkId('master_profile', id, 'identity'),
      profileId,
      sourceType: 'master_profile',
      sourceId: id,
      scoredJobId: null,
      section: 'identity',
      content: `Name: ${profile.fullName || 'Unknown'}\nHeadline: ${profile.headline || 'N/A'}\nYears of Experience: ${profile.yearsOfExperience || 'N/A'}\nTarget Seniority: ${profile.targetSeniority || 'N/A'}`,
      metadata: {},
    });
  }

  // Skills
  const explicit = safeParseJson(profile.skillsExplicit) || [];
  const inferred = safeParseJson(profile.skillsInferred) || [];
  if (explicit.length > 0 || inferred.length > 0) {
    chunks.push({
      chunkId: makeChunkId('master_profile', id, 'skills'),
      profileId,
      sourceType: 'master_profile',
      sourceId: id,
      scoredJobId: null,
      section: 'skills',
      content: `Explicit Skills: ${explicit.join(', ')}\nInferred Skills: ${inferred.join(', ')}`,
      metadata: {},
    });
  }

  // Tools
  const tools = safeParseJson(profile.tools) || [];
  if (tools.length > 0) {
    chunks.push({
      chunkId: makeChunkId('master_profile', id, 'tools'),
      profileId,
      sourceType: 'master_profile',
      sourceId: id,
      scoredJobId: null,
      section: 'tools',
      content: `Tools & Platforms: ${tools.join(', ')}`,
      metadata: {},
    });
  }

  // Experience — one chunk per role
  const experience = safeParseJson(profile.experience) || [];
  experience.forEach((exp: any, idx: number) => {
    chunks.push({
      chunkId: makeChunkId('master_profile', id, `experience_${idx}`),
      profileId,
      sourceType: 'master_profile',
      sourceId: id,
      scoredJobId: null,
      section: `experience_${idx}`,
      content: `Role: ${exp.role || 'N/A'} at ${exp.company || 'N/A'}\nDuration: ${exp.duration || 'N/A'}\nSummary: ${exp.summary || 'N/A'}`,
      metadata: { role: exp.role, company: exp.company },
    });
  });

  // Projects — one chunk per project
  const projects = safeParseJson(profile.projects) || [];
  projects.forEach((proj: any, idx: number) => {
    chunks.push({
      chunkId: makeChunkId('master_profile', id, `project_${idx}`),
      profileId,
      sourceType: 'master_profile',
      sourceId: id,
      scoredJobId: null,
      section: `project_${idx}`,
      content: `Project: ${proj.name || 'N/A'}\nDescription: ${proj.description || 'N/A'}\nTechnologies: ${(proj.technologies || []).join(', ')}`,
      metadata: { projectName: proj.name },
    });
  });

  // Education
  const education = safeParseJson(profile.education) || [];
  if (education.length > 0) {
    chunks.push({
      chunkId: makeChunkId('master_profile', id, 'education'),
      profileId,
      sourceType: 'master_profile',
      sourceId: id,
      scoredJobId: null,
      section: 'education',
      content: `Education:\n${education.map((e: any) => `${e.degree} — ${e.institution} (${e.year})`).join('\n')}`,
      metadata: {},
    });
  }

  // Achievements
  const achievements = safeParseJson(profile.achievements) || [];
  if (achievements.length > 0) {
    chunks.push({
      chunkId: makeChunkId('master_profile', id, 'achievements'),
      profileId,
      sourceType: 'master_profile',
      sourceId: id,
      scoredJobId: null,
      section: 'achievements',
      content: `Key Achievements:\n${achievements.map((a: string) => `• ${a}`).join('\n')}`,
      metadata: {},
    });
  }

  // Strengths and Gaps
  const strengths = safeParseJson(profile.strengths) || [];
  const gaps = safeParseJson(profile.gaps) || [];
  if (strengths.length > 0 || gaps.length > 0) {
    chunks.push({
      chunkId: makeChunkId('master_profile', id, 'strengths_gaps'),
      profileId,
      sourceType: 'master_profile',
      sourceId: id,
      scoredJobId: null,
      section: 'strengths_gaps',
      content: `Strengths: ${strengths.join(', ')}\nGaps/Areas for Improvement: ${gaps.join(', ')}`,
      metadata: {},
    });
  }

  return chunks;
}

function chunkResumeText(resume: any, profileId: number): RawChunk[] {
  if (!resume.parsedText) return [];
  
  // Split parsed resume text into paragraphs as rough sections
  const paragraphs = resume.parsedText.split(/\n{2,}/).filter((p: string) => p.trim().length > 20);
  
  return paragraphs.map((para: string, idx: number) => ({
    chunkId: makeChunkId('resume_text', resume.id, `paragraph_${idx}`),
    profileId,
    sourceType: 'resume_text' as SourceType,
    sourceId: resume.id,
    scoredJobId: null,
    section: `paragraph_${idx}`,
    content: para.trim(),
    metadata: { filename: resume.filename },
  }));
}

function chunkJobDescription(normalizedJob: any, scoredJobId: number, profileId: number): RawChunk[] {
  const chunks: RawChunk[] = [];

  chunks.push({
    chunkId: makeChunkId('job_description', scoredJobId, 'overview'),
    profileId,
    sourceType: 'job_description',
    sourceId: normalizedJob.id,
    scoredJobId,
    section: 'overview',
    content: `Job Title: ${normalizedJob.title}\nCompany: ${normalizedJob.company}\nLocation: ${normalizedJob.location || 'N/A'}\nSalary: ${normalizedJob.salaryRaw || 'Not specified'}\nExperience: ${normalizedJob.experienceRaw || 'Not specified'}`,
    metadata: { title: normalizedJob.title, company: normalizedJob.company },
  });

  if (normalizedJob.snippet) {
    // Split long snippets into chunks of ~300 words
    const words = normalizedJob.snippet.split(/\s+/);
    const chunkSize = 300;
    for (let i = 0; i < words.length; i += chunkSize) {
      const segment = words.slice(i, i + chunkSize).join(' ');
      chunks.push({
        chunkId: makeChunkId('job_description', scoredJobId, `snippet_${Math.floor(i / chunkSize)}`),
        profileId,
        sourceType: 'job_description',
        sourceId: normalizedJob.id,
        scoredJobId,
        section: `snippet_${Math.floor(i / chunkSize)}`,
        content: segment,
        metadata: { title: normalizedJob.title, company: normalizedJob.company },
      });
    }
  }

  return chunks;
}

function chunkJdAnalysis(analysis: any, scoredJobId: number, profileId: number): RawChunk[] {
  const chunks: RawChunk[] = [];

  const mustHave = safeParseJson(analysis.mustHaveSkills) || [];
  const preferred = safeParseJson(analysis.preferredSkills) || [];
  const atsKw = safeParseJson(analysis.atsKeywords) || [];
  const tools = safeParseJson(analysis.toolRequirements) || [];
  const senority = safeParseJson(analysis.senioritySignals) || [];

  chunks.push({
    chunkId: makeChunkId('jd_analysis', scoredJobId, 'requirements'),
    profileId,
    sourceType: 'jd_analysis',
    sourceId: analysis.id,
    scoredJobId,
    section: 'requirements',
    content: `Must-have Skills: ${mustHave.join(', ')}\nPreferred Skills: ${preferred.join(', ')}\nATS Keywords: ${atsKw.join(', ')}\nTool Requirements: ${tools.join(', ')}\nSeniority Signals: ${senority.join(', ')}`,
    metadata: {},
  });

  if (analysis.businessContext || analysis.hiringPriorities) {
    chunks.push({
      chunkId: makeChunkId('jd_analysis', scoredJobId, 'context'),
      profileId,
      sourceType: 'jd_analysis',
      sourceId: analysis.id,
      scoredJobId,
      section: 'context',
      content: `Business Context: ${analysis.businessContext || 'N/A'}\nHiring Priorities: ${analysis.hiringPriorities || 'N/A'}`,
      metadata: {},
    });
  }

  return chunks;
}

function chunkEnrichment(enrichment: any, scoredJobId: number, profileId: number): RawChunk[] {
  const pros = safeParseJson(enrichment.pros) || [];
  const cons = safeParseJson(enrichment.cons) || [];

  return [{
    chunkId: makeChunkId('enrichment', scoredJobId, 'brief'),
    profileId,
    sourceType: 'enrichment',
    sourceId: enrichment.id,
    scoredJobId,
    section: 'brief',
    content: `Fit Summary: ${enrichment.fitSummary || 'N/A'}\nPros: ${pros.join('; ')}\nCons: ${cons.join('; ')}\nInterview Angle: ${enrichment.interviewAngle || 'N/A'}\nResume Focus: ${enrichment.resumeFocus || 'N/A'}`,
    metadata: {},
  }];
}

function chunkDocumentAsset(asset: any, profileId: number): RawChunk[] {
  if (!asset.content) return [];

  const sourceType = asset.type as SourceType;
  let content = '';
  let section = 'full';

  if (asset.type === 'ats_report') {
    try {
      const report = JSON.parse(asset.content);
      content = `ATS Score: ${report.atsScore}%\nVerdict: ${report.verdict}\nKeywords Found: ${(report.keywordsFound || []).join(', ')}\nKeywords Missing: ${(report.keywordsMissing || []).join(', ')}\nStrengths: ${(report.strengths || []).join('; ')}\nRisks: ${(report.risks || []).join('; ')}`;
      section = 'ats_summary';
    } catch {
      content = asset.content;
    }
  } else if (asset.type === 'resume' || asset.type === 'tailored_resume') {
    try {
      const resume = JSON.parse(asset.content);
      // Return multiple chunks for tailored resume sections
      const chunks: RawChunk[] = [];
      
      chunks.push({
        chunkId: makeChunkId('tailored_resume', asset.scoredJobId, 'header'),
        profileId,
        sourceType: 'tailored_resume',
        sourceId: asset.id,
        scoredJobId: asset.scoredJobId,
        section: 'header',
        content: `Tailored Resume:\nName: ${resume.fullName}\nHeadline: ${resume.headline}\nSummary: ${resume.summary}`,
        metadata: { version: asset.version },
      });

      (resume.experience || []).forEach((exp: any, idx: number) => {
        chunks.push({
          chunkId: makeChunkId('tailored_resume', asset.scoredJobId, `exp_${idx}`),
          profileId,
          sourceType: 'tailored_resume',
          sourceId: asset.id,
          scoredJobId: asset.scoredJobId,
          section: `experience_${idx}`,
          content: `${exp.role} at ${exp.company} (${exp.duration})\n${(exp.bullets || []).map((b: string) => `• ${b}`).join('\n')}`,
          metadata: { version: asset.version },
        });
      });

      if (resume.skills?.length) {
        chunks.push({
          chunkId: makeChunkId('tailored_resume', asset.scoredJobId, 'skills'),
          profileId,
          sourceType: 'tailored_resume',
          sourceId: asset.id,
          scoredJobId: asset.scoredJobId,
          section: 'skills',
          content: `Tailored Skills: ${resume.skills.join(', ')}`,
          metadata: { version: asset.version },
        });
      }
      
      return chunks;
    } catch {
      content = asset.content;
    }
  } else {
    content = asset.content;
  }

  return [{
    chunkId: makeChunkId(sourceType, asset.scoredJobId, section),
    profileId,
    sourceType,
    sourceId: asset.id,
    scoredJobId: asset.scoredJobId,
    section,
    content,
    metadata: { version: asset.version },
  }];
}

function chunkSearchPreferences(profile: any, profileId: number): RawChunk[] {
  if (!profile) return [];

  const locations = safeParseJson(profile.locations) || [];
  const keywords = safeParseJson(profile.mustHaveKeywords) || [];
  const avoid = safeParseJson(profile.avoidKeywords) || [];
  const portals = safeParseJson(profile.preferredPortals) || [];

  return [{
    chunkId: makeChunkId('search_preferences', profile.id, 'prefs'),
    profileId,
    sourceType: 'search_preferences',
    sourceId: profile.id,
    scoredJobId: null,
    section: 'preferences',
    content: `Search Profile: ${profile.title}\nLocations: ${locations.join(', ')}\nWork Model: ${profile.workModel || 'N/A'}\nExpected Salary: ${profile.expectedSalary || 'N/A'}\nMust-have Keywords: ${keywords.join(', ')}\nAvoid: ${avoid.join(', ')}\nPreferred Portals: ${portals.join(', ')}\nNotice Period: ${profile.noticePeriod || 'N/A'}`,
    metadata: {},
  }];
}

// ── Main entry point ───────────────────────────────────────────────────────

/**
 * Generate all chunks for a given scope.
 * If scoredJobId is provided, includes job-specific materials.
 * Always includes profile-level materials.
 */
export function generateChunks(options: {
  includeProfile?: boolean;
  scoredJobId?: number;
  includeAllJobs?: boolean;
}): RawChunk[] {
  const db = getDb();
  const { profileId } = resolveContext();
  const allChunks: RawChunk[] = [];

  // Profile-level chunks
  if (options.includeProfile !== false) {
    const profiles = db.select().from(masterProfiles).where(eq(masterProfiles.profileId, profileId)).all();
    for (const p of profiles) {
      allChunks.push(...chunkMasterProfile(p, profileId));
    }

    const resumes = db.select().from(uploadedResumes).where(eq(uploadedResumes.profileId, profileId)).all();
    for (const r of resumes) {
      allChunks.push(...chunkResumeText(r, profileId));
    }

    const searchProfs = db.select().from(searchProfiles).where(eq(searchProfiles.profileId, profileId)).all();
    for (const sp of searchProfs) {
      allChunks.push(...chunkSearchPreferences(sp, profileId));
    }
  }

  // Job-specific chunks
  const getJobChunks = (sjId: number) => {
    const scored = db.select()
      .from(scoredJobs)
      .where(and(
        eq(scoredJobs.id, sjId),
        eq(scoredJobs.profileId, profileId)
      ))
      .get();
    if (!scored) return;

    const nj = db.select().from(normalizedJobs).where(eq(normalizedJobs.id, scored.normalizedJobId)).get();
    if (nj) {
      allChunks.push(...chunkJobDescription(nj, sjId, profileId));
    }

    const jdAn = db.select().from(jdAnalyses).where(eq(jdAnalyses.scoredJobId, sjId)).get();
    if (jdAn) {
      allChunks.push(...chunkJdAnalysis(jdAn, sjId, profileId));
    }

    const enrichment = db.select().from(jobEnrichments).where(eq(jobEnrichments.scoredJobId, sjId)).get();
    if (enrichment) {
      allChunks.push(...chunkEnrichment(enrichment, sjId, profileId));
    }

    const assets = db.select().from(documentAssets).where(and(eq(documentAssets.scoredJobId, sjId), eq(documentAssets.profileId, profileId))).all();
    for (const asset of assets) {
      allChunks.push(...chunkDocumentAsset(asset, profileId));
    }
  };

  if (options.scoredJobId) {
    getJobChunks(options.scoredJobId);
  }

  if (options.includeAllJobs) {
    const allScored = db.select().from(scoredJobs).where(eq(scoredJobs.profileId, profileId)).all();
    for (const sj of allScored) {
      if (sj.id !== options.scoredJobId) {
        getJobChunks(sj.id);
      }
    }
  }

  return allChunks;
}
