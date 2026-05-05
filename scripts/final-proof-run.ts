import fs from 'fs';
import path from 'path';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { and, desc, eq } from 'drizzle-orm';
import { chromium } from 'playwright';

const root = process.cwd();

type ProviderProofName =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'groq'
  | 'deepseek'
  | 'openai-compatible'
  | 'ollama'
  | 'deterministic';

function writeJson(filePath: string, data: any) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
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

function configuredEnvSource(entry: (typeof PROVIDER_PROOF_CATALOG)[number]) {
  const keys = entry.kind === 'cloud'
    ? entry.envKeys
    : [...entry.envKeys, ...(entry.baseUrlKeys || []), ...(entry.modelKeys || [])];
  for (const key of keys) {
    if (process.env[key]?.trim()) return `env:${key}`;
  }
  return '';
}

function configuredSettingsSource(provider: ProviderProofName, parsed: any) {
  if (!parsed || typeof parsed !== 'object') return '';
  if (provider === 'gemini' && typeof parsed.geminiApiKey === 'string' && parsed.geminiApiKey.trim()) {
    return 'settings:data/config/settings.json:geminiApiKey';
  }
  const providerSettings = parsed.aiProviders?.[provider];
  if (providerSettings?.apiKey || providerSettings?.baseUrl || providerSettings?.model || providerSettings?.enabled) {
    return `settings:data/config/settings.json:aiProviders.${provider}`;
  }
  if (parsed.aiProvider === provider || parsed.selectedProvider === provider) {
    return 'settings:data/config/settings.json:selected';
  }
  return '';
}

function buildProviderProof(geminiKey: string, existingConfig: any) {
  const providers = PROVIDER_PROOF_CATALOG.map((entry) => {
    const source = entry.provider === 'gemini' && geminiKey
      ? 'legacy_gemini_key'
      : configuredEnvSource(entry) || configuredSettingsSource(entry.provider, existingConfig) || 'not_configured';
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
        : 'This final proof does not require external keys; deterministic profile seed remains available.',
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

async function createCleanDocx(filePath: string) {
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ children: [new TextRun({ text: 'Asha Mehta', bold: true })] }),
        new Paragraph('AI Product Manager based in Bengaluru'),
        new Paragraph('Email: asha@example.com | Phone: +91 90000 00000 | LinkedIn: linkedin.com/in/asha'),
        new Paragraph('Experience: 6 years across fintech, SaaS, LLM products, analytics, and roadmap ownership.'),
        new Paragraph('Current Role: Senior Product Manager, Fintech Cloud India, Jan 2022 - Present.'),
        new Paragraph('Built AI onboarding assistant using LLMs, RAG, experimentation, and activation analytics.'),
        new Paragraph('Previous Role: Product Manager, SaaSWorks, Jun 2019 - Dec 2021.'),
        new Paragraph('Skills: Product strategy, AI product management, LLMs, RAG, SQL, analytics, PRDs, stakeholder management.'),
        new Paragraph('Education: B.Tech Computer Science, PES University, 2018.'),
      ],
    }],
  });
  const buffer = await Packer.toBuffer(doc);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buffer);
}

async function createTextPdf(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const browser: any = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
  await page.setContent(`
    <html>
      <body style="font-family: Helvetica, Arial, sans-serif; padding: 48px; color: #111827;">
        <main style="columns: 2; column-gap: 44px; font-size: 13px; line-height: 1.45;">
          <h1 style="font-size: 22px; break-after: avoid;">Asha Mehta</h1>
          <p>AI PM Fintech PES 2018 SaaS LLM RAG Bengaluru Analytics Roadmap</p>
          <p>Senior Product Manager Fintech Cloud India Jan 2022 Present</p>
          <p>Product Manager SaaSWorks Jun 2019 Dec 2021 Activation Experimentation</p>
          <p>Education B.Tech Computer Science PES University 2018</p>
          <p>Skills Product Strategy SQL Stakeholder Management PRDs</p>
          <p>Projects AI onboarding assistant Personalization Scoring Activation</p>
          <p>Highlights Reduced onboarding friction Partnered Engineering GTM Design</p>
          <p>Certifications Product Analytics Advanced SQL AI Product Strategy</p>
          <p>Ambiguity Latest role current employment relocation salary preference unclear</p>
          <p>Notes Resume intentionally uses two columns and compact short lines for parser warning validation</p>
        </main>
      </body>
    </html>
  `, { waitUntil: 'load' });
  await page.pdf({ path: filePath, format: 'A4', printBackground: true });
  await browser.close();
}

async function createImageOnlyPdf(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const browser: any = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
  await page.setContent(`
    <html>
      <body style="margin:0; background:white; font-family: Helvetica, Arial, sans-serif;">
        <section style="padding:64px; color:#111827;">
          <h1 style="font-size:34px;">Asha Mehta</h1>
          <p style="font-size:20px;">AI Product Manager | Bengaluru | Fintech | LLM | RAG</p>
          <p style="font-size:18px;">Senior Product Manager, Fintech Cloud India, Jan 2022 - Present.</p>
          <p style="font-size:18px;">Built AI onboarding workflows and activation analytics.</p>
        </section>
      </body>
    </html>
  `, { waitUntil: 'load' });
  const png = await page.screenshot({ fullPage: true, type: 'png' });
  await page.setContent(`
    <html>
      <body style="margin:0; padding:0;">
        <img alt="" src="data:image/png;base64,${png.toString('base64')}" style="width:100%; height:auto;" />
      </body>
    </html>
  `, { waitUntil: 'load' });
  await page.pdf({ path: filePath, format: 'A4', printBackground: true });
  await browser.close();
}

async function main() {
  process.env.JOBHUNT_ENABLE_VALIDATION_SOURCE = '1';

  const {
    getDb,
  } = await import('../src/db');
  const schema = await import('../src/db/schema');
  const { saveAppConfig, getAppConfig, ONBOARDING_FLOW_VERSION } = await import('../src/lib/config');
  const { getBaseAppDir, getAppSubDir } = await import('../src/lib/local-paths');
  const { resolveContext } = await import('../src/lib/platform/identity');
  const { parseResumeFileWithMetadata } = await import('../src/lib/services/resume-parser');
  const { validateApiKeyDetailed, extractProfileWithAnalysis } = await import('../src/lib/services/gemini');
  const { ScanOrchestrator } = await import('../src/lib/services/scraping/orchestrator');
  const { scoreUnscoredJobs } = await import('../src/lib/services/scoring/engine');
  const { getCommandCenterData } = await import('../src/lib/services/dashboard/command-center');
  const { toggleAppliedStatus, toggleSavedStatus, generateResumePipeline, generateCoverLetterAction, generateOutreachNoteAction } = await import('../src/app/discover/document-actions');
  const { generateBriefForJob } = await import('../src/app/discover/actions');

  const db = getDb();
  const { userId, profileId } = resolveContext();
  const appDir = getBaseAppDir();
  const fixturesDir = path.join(appDir, 'proof-fixtures');
  const proof: any = {
    appDir,
    startedAt: new Date().toISOString(),
    steps: [],
  };

  saveAppConfig({
    isConfigured: false,
    onboardingStage: 'welcome',
    onboardingStep: 0,
    onboardingVersion: ONBOARDING_FLOW_VERSION,
    resumeUploadId: undefined,
    masterProfileId: undefined,
    searchProfileId: undefined,
    lastInitialScanAt: undefined,
    dashboardUnlockedAt: undefined,
  });
  proof.steps.push({ name: 'reset_config', config: getAppConfig() });

  const cleanDocx = path.join(fixturesDir, 'clean-resume.docx');
  const ambiguousPdf = path.join(fixturesDir, 'ambiguous-two-column.pdf');
  const scannedPdf = path.join(fixturesDir, 'scanned-empty.pdf');
  await createCleanDocx(cleanDocx);
  await createTextPdf(ambiguousPdf);
  await createImageOnlyPdf(scannedPdf);

  const cleanParsed = await parseResumeFileWithMetadata(cleanDocx, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  const ambiguousParsed = await parseResumeFileWithMetadata(ambiguousPdf, 'application/pdf');
  const scannedParsed = await parseResumeFileWithMetadata(scannedPdf, 'application/pdf');
  proof.resumeParsing = {
    clean: cleanParsed.metadata,
    ambiguous: ambiguousParsed.metadata,
    scanned: scannedParsed.metadata,
  };

  const uploaded = db.insert(schema.uploadedResumes).values({
    profileId,
    filename: 'clean-resume.docx',
    originalPath: cleanDocx,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    parsedText: cleanParsed.text,
    parseMetadata: JSON.stringify({ parser: cleanParsed.metadata, analysis: null, clarificationAnswers: {} }),
    uploadedAt: new Date(),
  }).returning({ id: schema.uploadedResumes.id }).get();

  const existingConfig = (() => {
    try {
      return JSON.parse(fs.readFileSync(path.join(root, 'data', 'config', 'settings.json'), 'utf8'));
    } catch {
      return {};
    }
  })();
  const key = process.env.GEMINI_API_KEY || existingConfig.geminiApiKey || '';
  const aiProviderProof = buildProviderProof(key, existingConfig);
  proof.aiProviderProof = aiProviderProof;
  let profile: any;
  let analysis: any;
  let geminiValid = false;

  if (key) {
    const validation = await validateApiKeyDetailed(key);
    proof.geminiValidation = { category: validation.category, success: validation.success, message: validation.message };
    geminiValid = validation.success;
    if (validation.success) {
      const extracted = await extractProfileWithAnalysis(cleanParsed.text, key);
      profile = extracted.profile;
      analysis = extracted.analysis;
    }
  } else {
    proof.geminiValidation = { success: false, category: 'missing', message: 'No exercised Gemini key available in env or local config; deterministic proof seed remains available.' };
  }

  if (!profile) {
    profile = {
      fullName: 'Asha Mehta',
      headline: 'AI Product Manager',
      yearsOfExperience: 6,
      targetSeniority: 'Senior',
      skills: { explicit: ['AI product management', 'LLMs', 'RAG', 'SQL', 'Analytics'], inferred: ['Roadmapping', 'Stakeholder management'] },
      tools: ['LLM workflow tooling', 'SQL', 'Amplitude'],
      domains: ['Fintech', 'SaaS', 'AI'],
      experience: [{ role: 'Senior Product Manager', company: 'Fintech Cloud India', duration: 'Jan 2022 - Present', summary: 'Built AI onboarding assistant.' }],
      projects: [{ name: 'AI onboarding assistant', description: 'LLM and RAG workflow for onboarding.', technologies: ['LLM', 'RAG'] }],
      achievements: ['Improved activation through AI onboarding.'],
      education: [{ degree: 'B.Tech Computer Science', institution: 'PES University', year: '2018' }],
      certifications: [],
      strengths: ['AI product strategy', 'Fintech domain', 'Analytics'],
      gaps: [],
      rawSummary: 'Senior AI Product Manager focused on fintech and SaaS.',
      metadata: {},
    };
    analysis = {
      confidence: 88,
      confidenceNotes: 'Seeded proof profile because configured provider extraction was unavailable.',
      extractionIssues: [],
      needsClarification: false,
      clarificationQuestions: [],
    };
  }

  const master = db.insert(schema.masterProfiles).values({
    profileId,
    fullName: profile.fullName,
    headline: profile.headline,
    yearsOfExperience: profile.yearsOfExperience,
    targetSeniority: profile.targetSeniority,
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
    rawSummary: profile.rawSummary,
    updatedAt: new Date(),
  }).returning({ id: schema.masterProfiles.id }).get();

  db.update(schema.uploadedResumes).set({
    parseMetadata: JSON.stringify({ parser: cleanParsed.metadata, analysis, clarificationAnswers: {} }),
  }).where(eq(schema.uploadedResumes.id, uploaded.id)).run();

  const search = db.insert(schema.searchProfiles).values({
    profileId,
    title: 'AI Product Manager',
    locations: JSON.stringify(['Bengaluru', 'Remote']),
    workModel: 'hybrid',
    expectedSalary: '₹25-40 LPA',
    experienceBand: '4-8 years',
    companyTypes: JSON.stringify(['fintech', 'SaaS', 'AI-native']),
    preferredPortals: JSON.stringify(['validation_seed', 'validation_fail']),
    mustHaveKeywords: JSON.stringify(['AI', 'product', 'LLM']),
    avoidKeywords: JSON.stringify(['intern']),
    relocationWillingness: false,
    isActive: true,
  }).returning({ id: schema.searchProfiles.id }).get();

  saveAppConfig({
    geminiApiKey: key || undefined,
    aiProvider: key ? 'gemini' : aiProviderProof.activeProvider === 'ollama' ? 'ollama' : undefined,
    aiProviders: key
      ? { gemini: { apiKey: key, enabled: true } }
      : aiProviderProof.activeProvider === 'ollama'
        ? { ollama: { enabled: true } }
        : undefined,
    isConfigured: true,
    onboardingVersion: ONBOARDING_FLOW_VERSION,
    onboardingStage: 'dashboard',
    onboardingStep: 7,
    resumeUploadId: uploaded.id,
    masterProfileId: master.id,
    searchProfileId: search.id,
    lastInitialScanAt: new Date().toISOString(),
    dashboardUnlockedAt: new Date().toISOString(),
  });

  const scanResult = await new ScanOrchestrator().runScan(search.id, ['validation_seed', 'validation_fail']);
  const scoredCount = await scoreUnscoredJobs(profileId);
  const dashboard = await getCommandCenterData();
  const firstJob = db.select().from(schema.scoredJobs)
    .where(and(eq(schema.scoredJobs.profileId, profileId), eq(schema.scoredJobs.searchProfileId, search.id)))
    .orderBy(desc(schema.scoredJobs.score))
    .get();

  if (!firstJob) throw new Error('Proof run failed: no scored job was created.');

  const saved = await toggleSavedStatus(firstJob.id);
  const applied = await toggleAppliedStatus(firstJob.id);
  const applications = db.select().from(schema.applications).where(eq(schema.applications.profileId, profileId)).all();

  const aiActions: any = {
    attemptedWithRealProvider: geminiValid,
    attemptedProvider: geminiValid ? 'gemini' : aiProviderProof.activeProvider,
    attemptedWithRealGemini: geminiValid,
    legacyGeminiField: true,
  };
  if (geminiValid) {
    try {
      aiActions.brief = await generateBriefForJob(firstJob.id);
    } catch (error: any) {
      aiActions.brief = { success: false, error: error.message };
    }
    try {
      aiActions.resume = await generateResumePipeline(firstJob.id);
    } catch (error: any) {
      aiActions.resume = { success: false, error: error.message };
    }
    try {
      aiActions.cover = await generateCoverLetterAction(firstJob.id);
    } catch (error: any) {
      aiActions.cover = { success: false, error: error.message };
    }
    try {
      aiActions.connect = await generateOutreachNoteAction(firstJob.id);
    } catch (error: any) {
      aiActions.connect = { success: false, error: error.message };
    }
  }

  const assets = db.select().from(schema.documentAssets).where(eq(schema.documentAssets.profileId, profileId)).all();
  const portalRuns = db.select().from(schema.scanPortalRuns)
    .where(eq(schema.scanPortalRuns.scanId, scanResult.scanId))
    .all();

  proof.summary = {
    userId,
    profileId,
    uploadedResumeId: uploaded.id,
    masterProfileId: master.id,
    searchProfileId: search.id,
    scanResult,
    scoredCount,
    dashboardStats: dashboard.stats,
    dashboardQueueLength: dashboard.priorityQueue.length,
    portalRuns,
    saved,
    applied,
    applicationCount: applications.length,
    documentAssetCount: assets.length,
    aiActions,
  };

  proof.finishedAt = new Date().toISOString();
  const outputPath = path.join(getAppSubDir('logs'), 'final-proof-run.json');
  writeJson(outputPath, proof);
  console.log(JSON.stringify({ success: true, outputPath, summary: proof.summary }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
