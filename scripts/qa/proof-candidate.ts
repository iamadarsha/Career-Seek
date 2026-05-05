import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '../../src/db';
import {
  documentAssets,
  masterProfiles,
  normalizedJobs,
  scanPortalRuns,
  scoredJobs,
  searchProfiles,
  uploadedResumes,
} from '../../src/db/schema';
import { getAppSubDir, getBaseAppDir } from '../../src/lib/local-paths';
import { saveAppConfig } from '../../src/lib/config';
import {
  buildDeterministicProfileFromResumeText,
  extractProfileWithAnalysis,
  refineProfileWithClarifications,
  safeAiErrorMessage,
} from '../../src/lib/services/gemini';
import { parseResumeFileWithMetadata } from '../../src/lib/services/resume-parser';
import { ScanOrchestrator } from '../../src/lib/services/scraping/orchestrator';
import { scoreUnscoredJobs } from '../../src/lib/services/scoring/engine';
import { generateBriefForJob } from '../../src/app/discover/actions';
import {
  generateCoverLetterAction,
  generateOutreachNoteAction,
  generateResumePipeline,
} from '../../src/app/discover/document-actions';
import { manualImportJobUrl } from '../../src/app/discover/actions';
import { createFromScoredJob, changeStatus } from '../../src/lib/services/crm/application-service';
import { createNote } from '../../src/lib/services/crm/notes-service';
import { createReminder } from '../../src/lib/services/crm/reminder-service';
import { indexDocuments } from '../../src/lib/services/coach/embedder';
import { generateGroundedAnswer } from '../../src/lib/services/coach/answer';
import { buildTextPdf } from '../../src/lib/services/documents/docx-builder';
import { getQaCandidate, type QaCandidate } from './four-candidate-data';

dotenv.config({ path: '.env.local' });
dotenv.config();

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PDF_MIME = 'application/pdf';
const DEFAULT_MAX_JOBS = 5;

interface ProofIssue {
  area: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
}

type ProviderProofName =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'groq'
  | 'deepseek'
  | 'openai-compatible'
  | 'ollama'
  | 'deterministic';

function stepTimeoutMs(kind: 'default' | 'brief' | 'resume_pipeline' | 'cover_letter' | 'outreach' | 'index' | 'coach' = 'default') {
  const specificEnv: Record<typeof kind, string | undefined> = {
    default: process.env.CAREER_SEEK_QA_STEP_TIMEOUT_MS,
    brief: process.env.CAREER_SEEK_QA_BRIEF_TIMEOUT_MS,
    resume_pipeline: process.env.CAREER_SEEK_QA_RESUME_TIMEOUT_MS,
    cover_letter: process.env.CAREER_SEEK_QA_COVER_TIMEOUT_MS,
    outreach: process.env.CAREER_SEEK_QA_OUTREACH_TIMEOUT_MS,
    index: process.env.CAREER_SEEK_QA_INDEX_TIMEOUT_MS,
    coach: process.env.CAREER_SEEK_QA_COACH_TIMEOUT_MS,
  };
  const fallback: Record<typeof kind, number> = {
    default: 25_000,
    brief: 30_000,
    resume_pipeline: 90_000,
    cover_letter: 45_000,
    outreach: 30_000,
    index: 90_000,
    coach: 30_000,
  };
  const configured = Number(specificEnv[kind] || specificEnv.default || fallback[kind]);
  if (!Number.isFinite(configured) || configured <= 0) return 25_000;
  return Math.max(5_000, Math.min(configured, 120_000));
}

function arg(name: string, fallback?: string) {
  const flag = `--${name}`;
  const index = process.argv.indexOf(flag);
  if (index >= 0) return process.argv[index + 1];
  return fallback;
}

function normalizeText(value: unknown) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function safeJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

const PROVIDER_PROOF_CATALOG: Array<{
  provider: ProviderProofName;
  label: string;
  kind: 'cloud' | 'compatible' | 'local' | 'fallback';
  envKeys: string[];
  baseUrlKeys?: string[];
  modelKeys?: string[];
}> = [
  { provider: 'openai', label: 'OpenAI', kind: 'cloud', envKeys: ['OPENAI_API_KEY'], modelKeys: ['CAREER_SEEK_OPENAI_MODEL', 'OPENAI_MODEL'] },
  { provider: 'anthropic', label: 'Anthropic Claude', kind: 'cloud', envKeys: ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY'], modelKeys: ['CAREER_SEEK_ANTHROPIC_MODEL', 'ANTHROPIC_MODEL'] },
  { provider: 'gemini', label: 'Google Gemini', kind: 'cloud', envKeys: ['GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'GOOGLE_AI_API_KEY'], modelKeys: ['CAREER_SEEK_GEMINI_MODEL', 'GEMINI_MODEL'] },
  { provider: 'groq', label: 'Groq', kind: 'compatible', envKeys: ['GROQ_API_KEY'], baseUrlKeys: ['GROQ_BASE_URL'], modelKeys: ['CAREER_SEEK_GROQ_MODEL', 'GROQ_MODEL'] },
  { provider: 'deepseek', label: 'DeepSeek', kind: 'compatible', envKeys: ['DEEPSEEK_API_KEY'], baseUrlKeys: ['DEEPSEEK_BASE_URL'], modelKeys: ['CAREER_SEEK_DEEPSEEK_MODEL', 'DEEPSEEK_MODEL'] },
  { provider: 'openai-compatible', label: 'OpenAI-compatible', kind: 'compatible', envKeys: ['OPENAI_COMPATIBLE_API_KEY'], baseUrlKeys: ['OPENAI_COMPATIBLE_BASE_URL'], modelKeys: ['CAREER_SEEK_OPENAI_COMPATIBLE_MODEL', 'OPENAI_COMPATIBLE_MODEL'] },
  { provider: 'ollama', label: 'Ollama local', kind: 'local', envKeys: ['OLLAMA_API_KEY'], baseUrlKeys: ['OLLAMA_BASE_URL'], modelKeys: ['CAREER_SEEK_OLLAMA_MODEL', 'OLLAMA_MODEL'] },
];

function candidateConfigPaths() {
  return [
    process.env.CAREER_SEEK_SOURCE_DATA_DIR,
    path.join(process.cwd(), 'data'),
    path.join(process.env.HOME || '', '.jobhunt-india'),
  ].filter(Boolean) as string[];
}

function readSettingsJson(baseDir: string) {
  try {
    return JSON.parse(fs.readFileSync(path.join(baseDir, 'config', 'settings.json'), 'utf8'));
  } catch {
    return null;
  }
}

function configuredEnvSource(entry: (typeof PROVIDER_PROOF_CATALOG)[number]) {
  const keys = entry.kind === 'cloud'
    ? entry.envKeys
    : [...entry.envKeys, ...(entry.baseUrlKeys || []), ...(entry.modelKeys || [])];
  for (const key of keys) {
    if (process.env[key]?.trim()) return `env:${key}`;
  }
  return '';
}

function configuredSettingsSource(provider: ProviderProofName) {
  for (const baseDir of candidateConfigPaths()) {
    const parsed = readSettingsJson(baseDir);
    if (!parsed) continue;
    if (provider === 'gemini' && typeof parsed.geminiApiKey === 'string' && parsed.geminiApiKey.trim()) {
      return `settings:${path.join(baseDir, 'config', 'settings.json')}:geminiApiKey`;
    }
    const providerSettings = parsed.aiProviders?.[provider];
    if (providerSettings?.apiKey || providerSettings?.baseUrl || providerSettings?.model || providerSettings?.enabled) {
      return `settings:${path.join(baseDir, 'config', 'settings.json')}:aiProviders.${provider}`;
    }
    if (parsed.aiProvider === provider || parsed.selectedProvider === provider) {
      return `settings:${path.join(baseDir, 'config', 'settings.json')}:selected`;
    }
  }
  return '';
}

function buildProviderProof(geminiKey: string) {
  const providers = PROVIDER_PROOF_CATALOG.map((entry) => {
    const source = entry.provider === 'gemini' && geminiKey
      ? 'legacy_gemini_key'
      : configuredEnvSource(entry) || configuredSettingsSource(entry.provider) || 'not_configured';
    const configured = source !== 'not_configured';
    return {
      provider: entry.provider,
      label: entry.label,
      kind: entry.kind,
      configured,
      source,
      proofSupport: entry.provider === 'gemini' && geminiKey ? 'exercised' : 'metadata_only',
      note: entry.provider === 'ollama'
        ? 'Ollama is recorded for provider-matrix coverage without requiring a running local model.'
        : 'No external key is required for deterministic QA proof.',
    };
  });
  const activeProvider: ProviderProofName = geminiKey
    ? 'gemini'
    : providers.some((provider) => provider.provider === 'ollama' && provider.configured)
      ? 'ollama'
      : 'deterministic';

  return {
    activeProvider,
    noKeyPathAvailable: true,
    cloudConfigured: providers.some((provider) => provider.kind !== 'local' && provider.configured),
    ollamaConfigured: providers.some((provider) => provider.provider === 'ollama' && provider.configured),
    providers: [
      ...providers,
      {
        provider: 'deterministic' as ProviderProofName,
        label: 'Deterministic local fallback',
        kind: 'fallback',
        configured: true,
        source: 'built_in',
        proofSupport: 'fallback',
        note: 'Always available and used when no exercised provider is valid.',
      },
    ],
  };
}

async function withTimeout<T>(promise: Promise<T>, label: string, timeoutMs = stepTimeoutMs('default')): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
    promise.catch(() => {
      // Suppress late rejections after the timeout branch wins.
    });
  }
}

function readGeminiKey() {
  const envKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (envKey?.trim()) return envKey.trim();

  for (const baseDir of candidateConfigPaths()) {
    try {
      const settingsPath = path.join(baseDir, 'config', 'settings.json');
      const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      if (typeof parsed.geminiApiKey === 'string' && parsed.geminiApiKey.trim()) {
        return parsed.geminiApiKey.trim();
      }
    } catch {
      // Keep probing candidate config locations.
    }
  }

  return '';
}

function profileRow(profile: any, profileId: number) {
  return {
    profileId,
    fullName: profile.fullName || '',
    headline: profile.headline || '',
    yearsOfExperience: Number(profile.yearsOfExperience || 4),
    targetSeniority: profile.targetSeniority || 'Mid-level',
    skillsExplicit: JSON.stringify(profile.skills?.explicit || []),
    skillsInferred: JSON.stringify(profile.skills?.inferred || []),
    tools: JSON.stringify(profile.tools || []),
    domains: JSON.stringify(profile.domains || []),
    experience: JSON.stringify(profile.experience || []),
    projects: JSON.stringify(profile.projects || []),
    achievements: JSON.stringify(profile.achievements || []),
    education: JSON.stringify(profile.education || []),
    certifications: JSON.stringify(profile.certifications || []),
    strengths: JSON.stringify(profile.strengths || []),
    gaps: JSON.stringify(profile.gaps || []),
    rawSummary: profile.rawSummary || '',
    updatedAt: new Date(),
  };
}

function fallbackProfile(candidate: QaCandidate) {
  const summary = candidate.resumeText.split('\n').slice(0, 28).join(' ').replace(/\s+/g, ' ').trim();
  const years = Number((candidate.experienceBand.match(/\d+(?:\.\d+)?/) || ['4'])[0]);
  return {
    fullName: candidate.fullName,
    headline: `${candidate.targetTitle} with ${candidate.experienceBand} of practical India-focused experience`,
    yearsOfExperience: years,
    targetSeniority: years >= 7 ? 'Senior' : years < 2 ? 'Junior' : 'Mid-level',
    skills: {
      explicit: candidate.mustHaveKeywords,
      inferred: [
        'Cross-functional collaboration',
        'Stakeholder communication',
        'Data-informed prioritization',
        'Production-quality delivery',
      ],
    },
    tools: candidate.mustHaveKeywords.filter((term) => /figma|sql|java|react|aws|excel|jira|kafka|postgres|analytics/i.test(term)),
    domains: candidate.companyTypes,
    experience: [
      {
        role: candidate.targetTitle,
        company: 'Current employer from uploaded resume',
        duration: '2022-Present',
        summary,
      },
    ],
    projects: [
      {
        name: `${candidate.targetTitle} flagship project`,
        description: 'Detailed project evidence is available in the parsed resume text.',
        technologies: candidate.mustHaveKeywords,
      },
    ],
    achievements: [
      'Delivered measurable role-relevant outcomes described in the uploaded resume.',
      'Prepared detailed assignments, analysis, and project documentation relevant to the target role.',
    ],
    education: [
      {
        degree: 'Education details from uploaded resume',
        institution: 'See parsed resume',
        year: 'See parsed resume',
      },
    ],
    certifications: [],
    strengths: candidate.mustHaveKeywords.slice(0, 5),
    gaps: ['Fallback profile used because provider extraction was unavailable or failed grounding checks.'],
    rawSummary: summary,
    metadata: {
      confidenceNotes: 'Deterministic QA fallback profile used for flow validation.',
    },
  };
}

async function writeDocxResume(candidate: QaCandidate) {
  const outputDir = path.join(getAppSubDir('uploads'), 'qa-resumes');
  fs.mkdirSync(outputDir, { recursive: true });

  const children = candidate.resumeText
    .trim()
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return new Paragraph({ children: [new TextRun('')] });
      const isHeader = /^[A-Z][A-Z0-9 &,/()'._-]{2,}$/.test(trimmed) && trimmed.length < 90;
      return new Paragraph({
        children: [
          new TextRun({
            text: trimmed,
            bold: isHeader,
          }),
        ],
        spacing: { after: isHeader ? 160 : 80 },
      });
    });

  const doc = new Document({ sections: [{ children }] });
  const buffer = await Packer.toBuffer(doc);
  const filePath = path.join(outputDir, `${candidate.slug}-resume.docx`);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

async function writePdfResume(candidate: QaCandidate, filePath: string) {
  const lines = candidate.resumeText
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return buildTextPdf(lines, filePath);
}

function qaFixtureName(candidate: QaCandidate) {
  switch (candidate.slug) {
    case 'ai-pm-senior':
      return 'user1-resume';
    case 'backend-mid':
      return 'user2-resume';
    case 'ux-junior':
      return 'user3-resume';
    case 'finance-compliance':
      return 'user4-resume';
    default:
      return `${candidate.slug}-resume`;
  }
}

function fixtureDir() {
  const dir = path.join(process.cwd(), 'fixtures');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function preferredAdarshaResumeCandidates() {
  return [
    process.env.CAREER_SEEK_QA_ADARSHA_RESUME_PATH,
    process.env.CAREER_SEEK_QA_USER1_RESUME_PATH,
    path.join(process.cwd(), 'fixtures', 'user1-resume.pdf'),
    path.join(process.cwd(), 'fixtures', 'user1-resume.docx'),
    path.join(process.cwd(), 'data', 'uploads', '1777033401954-Resume_2026.docx'),
  ].filter(Boolean) as string[];
}

function copyFixtureFile(sourcePath: string, targetPath: string) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  if (path.resolve(sourcePath) === path.resolve(targetPath)) return targetPath;
  fs.copyFileSync(sourcePath, targetPath);
  return targetPath;
}

async function prepareResumeFixture(candidate: QaCandidate) {
  const fixtures = fixtureDir();
  const fixtureBase = qaFixtureName(candidate);
  const generatedDocxPath = path.join(fixtures, `${fixtureBase}.docx`);

  if (candidate.slug === 'ai-pm-senior') {
    for (const sourcePath of preferredAdarshaResumeCandidates()) {
      if (!sourcePath || !fs.existsSync(sourcePath)) continue;
      const ext = path.extname(sourcePath).toLowerCase();
      const targetPath = path.join(fixtures, `${fixtureBase}${ext || '.docx'}`);
      copyFixtureFile(sourcePath, targetPath);
      return {
        uploadPath: targetPath,
        uploadMimeType: ext === '.pdf' ? PDF_MIME : DOCX_MIME,
        alternatePath: null as string | null,
        alternateMimeType: null as string | null,
        source: 'existing_adarsha_resume',
      };
    }
  }

  const docxPath = await writeDocxResume(candidate);
  copyFixtureFile(docxPath, generatedDocxPath);

  if (candidate.slug !== 'ai-pm-senior') {
    const pdfPath = path.join(fixtures, `${fixtureBase}.pdf`);
    await writePdfResume(candidate, pdfPath);
    return {
      uploadPath: pdfPath,
      uploadMimeType: PDF_MIME,
      alternatePath: generatedDocxPath,
      alternateMimeType: DOCX_MIME,
      source: 'generated_pdf_fixture',
    };
  }

  return {
    uploadPath: generatedDocxPath,
    uploadMimeType: DOCX_MIME,
    alternatePath: null as string | null,
    alternateMimeType: null as string | null,
    source: 'generated_docx_fixture',
  };
}

async function parseFixtureWithFallback(
  uploadPath: string,
  uploadMimeType: string,
  alternatePath: string | null,
  alternateMimeType: string | null,
) {
  let primaryError: unknown = null;
  let primary: Awaited<ReturnType<typeof parseResumeFileWithMetadata>> | null = null;
  try {
    primary = await parseResumeFileWithMetadata(uploadPath, uploadMimeType);
  } catch (error) {
    primaryError = error;
  }

  if (!primary && (!alternatePath || !alternateMimeType)) {
    throw primaryError instanceof Error ? primaryError : new Error(String(primaryError || 'Primary resume parse failed.'));
  }

  if (primary && (primary.text.length >= 900 || !alternatePath || !alternateMimeType)) {
    return {
      parsed: primary,
      parsedFromPath: uploadPath,
      parsedFromMimeType: uploadMimeType,
      usedAlternate: false,
      primaryError: primaryError ? safeAiErrorMessage(primaryError) : null,
    };
  }

  if (!alternatePath || !alternateMimeType) {
    throw primaryError instanceof Error ? primaryError : new Error(String(primaryError || 'Resume parse failed.'));
  }

  const alternate = await parseResumeFileWithMetadata(alternatePath, alternateMimeType);
  if (!primary || alternate.text.length > primary.text.length) {
    return {
      parsed: alternate,
      parsedFromPath: alternatePath,
      parsedFromMimeType: alternateMimeType,
      usedAlternate: true,
      primaryError: primaryError ? safeAiErrorMessage(primaryError) : null,
    };
  }

  if (primary.text.length >= 900 || !alternatePath || !alternateMimeType) {
    return {
      parsed: primary,
      parsedFromPath: uploadPath,
      parsedFromMimeType: uploadMimeType,
      usedAlternate: false,
      primaryError: primaryError ? safeAiErrorMessage(primaryError) : null,
    };
  }

  return {
    parsed: primary,
    parsedFromPath: uploadPath,
    parsedFromMimeType: uploadMimeType,
    usedAlternate: false,
    primaryError: primaryError ? safeAiErrorMessage(primaryError) : null,
  };
}

function insertSearchProfile(candidate: QaCandidate, profileId: number, selectedPortals: string[]) {
  const db = getDb();
  db.update(searchProfiles)
    .set({ isActive: false })
    .where(eq(searchProfiles.profileId, profileId))
    .run();

  return db.insert(searchProfiles).values({
    profileId,
    title: candidate.targetTitle,
    locations: JSON.stringify(candidate.locations),
    workModel: candidate.workModel,
    expectedSalary: candidate.expectedSalary,
    experienceBand: candidate.experienceBand,
    companyTypes: JSON.stringify([
      ...candidate.companyTypes,
      ...(candidate.targetCompanies || []).map((company) => `target_company:${company}`),
    ]),
    preferredPortals: JSON.stringify(selectedPortals),
    mustHaveKeywords: JSON.stringify(candidate.mustHaveKeywords),
    avoidKeywords: JSON.stringify(candidate.avoidKeywords),
    noticePeriod: candidate.noticePeriod,
    relocationWillingness: true,
    isActive: true,
  }).returning().get();
}

function isDisplayableJob(job: typeof normalizedJobs.$inferSelect) {
  const portal = String(job.portal || '');
  const title = String(job.title || '').trim();
  const company = String(job.company || '').trim();
  const url = String(job.applyUrl || job.url || '');
  if (process.env.JOBHUNT_ENABLE_VALIDATION_SOURCE !== '1' && portal.startsWith('validation_')) return false;
  if (/\/undefined(?:$|[/?#])/i.test(url)) return false;
  if (/^foundit job$/i.test(title) && /^company not listed$/i.test(company)) return false;
  if (/<[^>]+>|src=|data-nimg|logo\.svg/i.test(title)) return false;
  return true;
}

function getTopJobs(limit: number) {
  const db = getDb();
  return db.select({
    scoredJob: scoredJobs,
    normalizedJob: normalizedJobs,
  })
    .from(scoredJobs)
    .innerJoin(normalizedJobs, eq(scoredJobs.normalizedJobId, normalizedJobs.id))
    .orderBy(desc(scoredJobs.score), desc(scoredJobs.scoredAt))
    .all()
    .filter((row) => isDisplayableJob(row.normalizedJob))
    .slice(0, limit);
}

async function checkUrl(url: string | null | undefined) {
  if (!url) return { ok: false, status: null, finalUrl: null, error: 'missing_url' };
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(12_000),
      headers: {
        'user-agent': 'CareerSeekQA/1.0 (+local production validation)',
      },
    });
    return {
      ok: response.ok,
      status: response.status,
      finalUrl: response.url,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      finalUrl: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const slug = arg('candidate') || process.env.CAREER_SEEK_QA_CANDIDATE || '';
  const candidate = getQaCandidate(slug);
  const issues: ProofIssue[] = [];
  const maxJobs = Number(arg('max-jobs', process.env.CAREER_SEEK_QA_MAX_JOBS || String(DEFAULT_MAX_JOBS)));
  const selectedPortals = (arg('portals', process.env.CAREER_SEEK_QA_PORTALS) || candidate.selectedPortals.join(','))
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  const geminiKey = readGeminiKey();
  const aiProviderProof = buildProviderProof(geminiKey);
  if (!geminiKey) {
    issues.push({
      area: 'ai_provider',
      severity: 'info',
      message: aiProviderProof.ollamaConfigured
        ? 'No legacy Gemini key was exercised by this proof path; provider matrix detected an Ollama/local configuration and deterministic fallbacks remain available.'
        : 'No exercised cloud provider key was found; deterministic fallbacks remain available for this proof.',
    });
  }

  saveAppConfig({
    geminiApiKey: geminiKey || undefined,
    aiProvider: geminiKey ? 'gemini' : aiProviderProof.activeProvider === 'ollama' ? 'ollama' : undefined,
    aiProviders: geminiKey
      ? { gemini: { apiKey: geminiKey, enabled: true } }
      : aiProviderProof.activeProvider === 'ollama'
        ? { ollama: { enabled: true } }
        : undefined,
    isConfigured: false,
    onboardingStage: 'resume',
    onboardingStep: 1,
    onboardingVersion: 2,
    lastKeyValidationAt: geminiKey ? new Date().toISOString() : undefined,
  });

  const db = getDb();
  const profileId = 1;
  const resumeFixture = await prepareResumeFixture(candidate);
  const parsedResult = await parseFixtureWithFallback(
    resumeFixture.uploadPath,
    resumeFixture.uploadMimeType,
    resumeFixture.alternatePath,
    resumeFixture.alternateMimeType,
  );
  const parsed = parsedResult.parsed;
  if (parsedResult.primaryError) {
    issues.push({
      area: 'resume_parser',
      severity: 'warning',
      message: `Primary resume parse needed a fallback: ${parsedResult.primaryError}`,
    });
  }
  if (parsed.text.length < 900) {
    issues.push({
      area: 'resume_parser',
      severity: 'warning',
      message: `Parsed resume text looked short (${parsed.text.length} chars).`,
    });
  }

  const resume = db.insert(uploadedResumes).values({
    profileId,
    filename: path.basename(parsedResult.parsedFromPath),
    originalPath: parsedResult.parsedFromPath,
    mimeType: parsedResult.parsedFromMimeType,
    parsedText: parsed.text,
    parseMetadata: JSON.stringify({
      parser: parsed.metadata,
      analysis: null,
      clarificationAnswers: {},
      qaCandidate: candidate.slug,
    }),
    uploadedAt: new Date(),
  }).returning().get();

  let extracted: any;
  let extractionMode = geminiKey ? 'provider_gemini' : 'deterministic_fallback';
  const deterministicFallback = () => buildDeterministicProfileFromResumeText(parsed.text, 'qa proof fallback');
  if (geminiKey) {
    try {
      extracted = await extractProfileWithAnalysis(parsed.text, geminiKey);
      const name = normalizeText(extracted.profile?.fullName);
      const expectedName = normalizeText(candidate.fullName);
      if (!name || !expectedName.split(' ').some((part) => part.length > 2 && name.includes(part))) {
        issues.push({
          area: 'profile_extraction',
          severity: 'warning',
          message: `Configured Gemini provider extracted "${extracted.profile?.fullName}" for ${candidate.fullName}; deterministic fallback was used.`,
        });
        extracted = deterministicFallback();
        extracted.analysis = {
          ...extracted.analysis,
          confidence: Math.min(Number(extracted.analysis?.confidence || 55), 58),
          confidenceNotes: 'Fallback after configured provider name grounding mismatch.',
          extractionIssues: Array.from(new Set([
            'Configured provider profile name mismatch.',
            ...(Array.isArray(extracted.analysis?.extractionIssues) ? extracted.analysis.extractionIssues : []),
          ].filter(Boolean))),
        };
        extractionMode = 'deterministic_fallback';
      }
    } catch (error) {
      issues.push({
        area: 'profile_extraction',
        severity: 'warning',
        message: `Configured Gemini provider extraction failed; deterministic fallback was used: ${safeAiErrorMessage(error)}`,
      });
      extracted = buildDeterministicProfileFromResumeText(parsed.text, safeAiErrorMessage(error));
      extracted.analysis = {
        ...extracted.analysis,
        confidence: Math.min(Number(extracted.analysis?.confidence || 52), 55),
        confidenceNotes: 'Fallback after configured provider extraction failure.',
      };
      extractionMode = 'deterministic_fallback';
    }
  } else {
    extracted = buildDeterministicProfileFromResumeText(parsed.text, 'No exercised provider key.');
    extracted.analysis = {
      ...extracted.analysis,
      confidence: Math.min(Number(extracted.analysis?.confidence || 50), 52),
      confidenceNotes: 'Fallback because no provider was exercised by this proof path.',
    };
    extractionMode = 'deterministic_fallback';
  }

  let profile = extracted.profile;
  if (geminiKey && extracted.analysis?.needsClarification) {
    try {
      profile = await refineProfileWithClarifications({
        resumeText: parsed.text,
        currentProfile: extracted.profile,
        answers: candidate.clarificationAnswers,
        questions: extracted.analysis.clarificationQuestions || [],
        apiKey: geminiKey,
      });
    } catch (error) {
      issues.push({
        area: 'profile_clarification',
        severity: 'warning',
        message: `Clarification refinement failed; using initial profile: ${safeAiErrorMessage(error)}`,
      });
    }
  }

  const master = db.insert(masterProfiles).values(profileRow(profile, profileId)).returning().get();
  db.update(uploadedResumes).set({
    parseMetadata: JSON.stringify({
      parser: parsed.metadata,
      analysis: extracted.analysis,
      clarificationAnswers: candidate.clarificationAnswers,
      clarificationAnsweredAt: new Date().toISOString(),
      qaCandidate: candidate.slug,
    }),
  }).where(eq(uploadedResumes.id, resume.id)).run();

  const searchProfile = insertSearchProfile(candidate, profileId, selectedPortals);
  saveAppConfig({
    isConfigured: true,
    onboardingStage: 'dashboard',
    onboardingStep: 7,
    resumeUploadId: resume.id,
    masterProfileId: master.id,
    searchProfileId: searchProfile.id,
    lastInitialScanAt: new Date().toISOString(),
    dashboardUnlockedAt: new Date().toISOString(),
  });

  const scan = await new ScanOrchestrator().runScan(
    searchProfile.id,
    selectedPortals,
    (update) => {
      if (process.env.CAREER_SEEK_QA_VERBOSE === '1') {
        console.log(`[${candidate.slug}] ${update.progress ?? '--'}% ${update.portal || 'scan'}: ${update.message}`);
      }
    },
    { bypassCache: true },
  );
  const scoredCount = scan.status === 'failed' ? 0 : await scoreUnscoredJobs(profileId);
  const portalRuns = db.select()
    .from(scanPortalRuns)
    .where(eq(scanPortalRuns.scanId, scan.scanId))
    .all();
  const scannedJobs = db.select()
    .from(normalizedJobs)
    .where(eq(normalizedJobs.scanId, scan.scanId))
    .all();
  const portalJobCounts = Object.fromEntries(
    scannedJobs.reduce((acc, row) => {
      acc.set(row.portal, (acc.get(row.portal) || 0) + 1);
      return acc;
    }, new Map<string, number>()),
  );
  const officialRows = scannedJobs.filter((row) =>
    row.portal === 'company_ats' ||
    row.portal === 'official' ||
    String(row.employmentType || '').startsWith('Official Career Page'),
  );
  const officialCompanies = Array.from(new Set(officialRows.map((row) => row.company).filter(Boolean))).sort();
  if (scan.status === 'failed') {
    issues.push({
      area: 'scan',
      severity: 'critical',
      message: `Live scan failed for ${candidate.slug}: ${scan.failedPortals} failed sources, ${scan.totalJobsFound} jobs.`,
    });
  }

  let manualImportProof: {
    attempted: boolean;
    url: string | null;
    success: boolean;
    message: string;
    scoredCount?: number;
  } = {
    attempted: false,
    url: candidate.manualLinkedinUrl || null,
    success: false,
    message: 'No LinkedIn manual import URL configured for this persona.',
  };

  if (candidate.manualLinkedinUrl) {
    manualImportProof.attempted = true;
    try {
      const imported = await withTimeout(
        manualImportJobUrl(searchProfile.id, candidate.manualLinkedinUrl),
        `manual_import:${candidate.slug}`,
        stepTimeoutMs('default'),
      );
      manualImportProof = {
        attempted: true,
        url: candidate.manualLinkedinUrl,
        success: Boolean(imported.success),
        message: imported.success ? imported.message || 'Manual URL imported and scored.' : imported.error || 'Manual URL import failed.',
        scoredCount: imported.success ? imported.scoredCount : undefined,
      };
      if (!imported.success) {
        issues.push({
          area: 'manual_url',
          severity: 'warning',
          message: `Manual LinkedIn URL import failed: ${imported.error || 'Unknown error.'}`,
        });
      }
    } catch (error) {
      const message = safeAiErrorMessage(error);
      manualImportProof = {
        attempted: true,
        url: candidate.manualLinkedinUrl,
        success: false,
        message,
      };
      issues.push({
        area: 'manual_url',
        severity: 'warning',
        message: `Manual LinkedIn URL import failed: ${message}`,
      });
    }
  }

  const topJobs = getTopJobs(maxJobs);
  if (topJobs.length < maxJobs) {
    issues.push({
      area: 'job_matching',
      severity: 'warning',
      message: `Only ${topJobs.length} displayable jobs were available; expected ${maxJobs}.`,
    });
  }

  const jobProofs = [];
  for (const row of topJobs) {
    const job = row.normalizedJob;
    const scored = row.scoredJob;
    const linkCheck = await checkUrl(job.applyUrl || job.url);
    const proofErrors: string[] = [];
    const brief = await withTimeout(generateBriefForJob(scored.id), `brief:${scored.id}`, stepTimeoutMs('brief')).catch((error) => {
      proofErrors.push(`brief: ${safeAiErrorMessage(error)}`);
      return { success: false, brief: null };
    });
    const resumePipeline = await withTimeout(
      generateResumePipeline(scored.id),
      `resume_pipeline:${scored.id}`,
      stepTimeoutMs('resume_pipeline'),
    ).catch((error) => {
      proofErrors.push(`resume_pipeline: ${safeAiErrorMessage(error)}`);
      return null;
    });
    const coverLetter = await withTimeout(
      generateCoverLetterAction(scored.id),
      `cover_letter:${scored.id}`,
      stepTimeoutMs('cover_letter'),
    ).catch((error) => {
      proofErrors.push(`cover_letter: ${safeAiErrorMessage(error)}`);
      return null;
    });
    const outreach = await withTimeout(
      generateOutreachNoteAction(scored.id),
      `outreach:${scored.id}`,
      stepTimeoutMs('outreach'),
    ).catch((error) => {
      proofErrors.push(`outreach: ${safeAiErrorMessage(error)}`);
      return null;
    });

    let applicationId: number | null = null;
    let applicationStatus = 'not_tracked';
    try {
      const app = createFromScoredJob(scored.id);
      applicationId = app.id;
      createNote({
        applicationId: app.id,
        category: 'qa_review',
        content: `QA proof for ${candidate.fullName}: checked link status ${linkCheck.status ?? 'n/a'}, generated brief/resume/cover letter/outreach, and marked local application as applied without submitting externally.`,
      });
      createReminder({
        applicationId: app.id,
        title: `Follow up on ${job.company} application`,
        description: 'QA-generated reminder to verify recruiter/contact path and response.',
        dueAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        category: 'follow_up',
      });
      const applied = changeStatus(app.id, 'applied');
      applicationStatus = applied?.status || 'applied';
    } catch (error) {
      proofErrors.push(`application_tracking: ${safeAiErrorMessage(error)}`);
    }

    const assets = db.select().from(documentAssets)
      .where(and(eq(documentAssets.profileId, profileId), eq(documentAssets.scoredJobId, scored.id)))
      .all();
    const resumeAsset = assets.find((asset) => asset.type === 'resume') || null;
    const pdfAsset = assets.find((asset) => asset.type === 'resume_pdf') || null;
    const atsAsset = assets.find((asset) => asset.type === 'ats_report') || null;

    jobProofs.push({
      scoredJobId: scored.id,
      score: scored.score,
      tier: scored.tier,
      title: job.title,
      company: job.company,
      portal: job.portal,
      location: job.location,
      url: job.url,
      applyUrl: job.applyUrl,
      linkCheck,
      briefOk: Boolean(brief.success && brief.brief?.fitSummary),
      resumeAssetId: resumePipeline?.resumeId || resumeAsset?.id || null,
      pdfResumeId: resumePipeline?.pdfResumeId || pdfAsset?.id || null,
      atsScore: resumePipeline?.atsReport?.atsScore || atsAsset?.atsScore || null,
      coverLetterId: coverLetter?.id || null,
      outreachId: outreach?.id || null,
      applicationId,
      applicationStatus,
      assetTypes: assets.map((asset) => asset.type),
      proofErrors,
    });
  }

  const coachJobId = jobProofs[0]?.scoredJobId || null;
  let indexResult: Awaited<ReturnType<typeof indexDocuments>> | null = null;
  let coachProofs: Array<{ question: string; confidence: string; answerPreview: string; sources: number; error?: string }> = [];
  try {
    indexResult = await withTimeout(
      indexDocuments({ includeProfile: true, scoredJobId: coachJobId || undefined, includeAllJobs: true, forceReindex: true }),
      `index_documents:${candidate.slug}`,
      stepTimeoutMs('index'),
    );
    for (const question of candidate.coachQuestions) {
      try {
        const response = await withTimeout(
          generateGroundedAnswer(question, coachJobId ? 'all_materials' : 'profile_only', coachJobId, [], 'concise'),
          `coach_answer:${candidate.slug}`,
          stepTimeoutMs('coach'),
        );
        coachProofs.push({
          question,
          confidence: response.answer.confidenceLevel,
          answerPreview: response.answer.answer.slice(0, 500),
          sources: response.sources.length,
        });
      } catch (error) {
        coachProofs.push({
          question,
          confidence: 'low',
          answerPreview: '',
          sources: 0,
          error: safeAiErrorMessage(error),
        });
      }
    }
  } catch (error) {
    issues.push({
      area: 'coach_rag',
      severity: 'warning',
      message: `Coach/RAG indexing or answer generation failed: ${safeAiErrorMessage(error)}`,
    });
  }

  const scoredRows = db.select().from(scoredJobs).all();
  const report = {
    candidate: {
      slug: candidate.slug,
      fullName: candidate.fullName,
      targetTitle: candidate.targetTitle,
      locations: candidate.locations,
      workModel: candidate.workModel,
      expectedSalary: candidate.expectedSalary,
    },
    dataDir: getBaseAppDir(),
    aiProviderProof,
    fixture: {
      uploadPath: resumeFixture.uploadPath,
      uploadMimeType: resumeFixture.uploadMimeType,
      alternatePath: resumeFixture.alternatePath,
      alternateMimeType: resumeFixture.alternateMimeType,
      parsedFromPath: parsedResult.parsedFromPath,
      parsedFromMimeType: parsedResult.parsedFromMimeType,
      usedAlternateForParsing: parsedResult.usedAlternate,
      primaryParseError: parsedResult.primaryError,
      source: resumeFixture.source,
    },
    extractionMode,
    parsedResumeChars: parsed.text.length,
    parserMetadata: parsed.metadata,
    profile: {
      id: master.id,
      fullName: master.fullName,
      headline: master.headline,
      yearsOfExperience: master.yearsOfExperience,
      skillsExplicit: safeJson<string[]>(master.skillsExplicit, []).slice(0, 20),
    },
    searchProfile: {
      id: searchProfile.id,
      title: searchProfile.title,
      selectedPortals,
    },
    scan: {
      ...scan,
      byPortal: portalRuns.map((row) => ({
        portal: row.portal,
        status: row.status,
        jobsFound: row.jobsFound,
        error: row.error,
      })),
      portalJobCounts,
      distinctCompanies: Array.from(new Set(scannedJobs.map((row) => row.company).filter(Boolean))).length,
      officialCareerPageJobs: officialRows.length,
      distinctOfficialCompanies: officialCompanies.length,
      officialCareerPageCompanies: officialCompanies,
    },
    scoredCount,
    totalScoredRows: scoredRows.length,
    jobProofs,
    indexResult,
    coachProofs,
    manualImportProof,
    issues,
    completedAt: new Date().toISOString(),
  };

  const reportDir = path.join(getBaseAppDir(), 'proof');
  fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, `${candidate.slug}-proof-report.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    candidate: candidate.slug,
    reportPath,
    scanStatus: scan.status,
    totalJobsFound: scan.totalJobsFound,
    scoredCount,
    jobProofs: jobProofs.length,
    issues: issues.length,
  }, null, 2));
}

main()
  .then(() => {
    // Some scraper/AI dependencies keep idle handles open after work completes.
    // The report is fully flushed above, so make the proof command deterministic.
    process.exit(0);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
