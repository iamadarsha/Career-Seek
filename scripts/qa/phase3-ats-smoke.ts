import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type FixtureResume = {
  fullName: string;
  headline: string;
  summary: string;
  skills: string[];
  tools: string[];
  experience: Array<{
    role: string;
    company: string;
    duration: string;
    bullets: string[];
  }>;
  education: Array<{
    degree: string;
    institution: string;
    year: string;
  }>;
};

type FixtureJdAnalysis = {
  mustHaveSkills: string[];
  preferredSkills: string[];
  atsKeywords: string[];
  domainLanguage: string[];
  senioritySignals: string[];
  leadershipSignals: string[];
  toolRequirements: string[];
  businessContext: string;
  hiringPriorities: string;
};

type Artifact = {
  kind: 'docx' | 'pdf' | 'txt' | 'json' | 'manifest';
  path: string;
};

const repoRoot = process.cwd();
const expectedScorerPath = path.join(repoRoot, 'src/lib/ats/scorer.ts');
const expectedBuilderPath = path.join(repoRoot, 'src/lib/ats/builder.ts');
const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'career-seek-phase3-ats-'));
const blockedOutboundFetches: string[] = [];

const CLOUD_ENV_KEYS = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_BASE_URL',
  'CAREER_SEEK_AI_MODEL',
  'CAREER_SEEK_AI_PROVIDER',
  'CAREER_SEEK_ANTHROPIC_MODEL',
  'CAREER_SEEK_DEEPSEEK_MODEL',
  'CAREER_SEEK_GEMINI_MODEL',
  'CAREER_SEEK_GROQ_MODEL',
  'CAREER_SEEK_OPENAI_COMPATIBLE_MODEL',
  'CAREER_SEEK_OPENAI_MODEL',
  'CLAUDE_API_KEY',
  'DEEPSEEK_API_KEY',
  'DEEPSEEK_BASE_URL',
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
  'GOOGLE_AI_API_KEY',
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'GROQ_API_KEY',
  'GROQ_BASE_URL',
  'OLLAMA_API_KEY',
  'OLLAMA_BASE_URL',
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'OPENAI_COMPATIBLE_API_KEY',
  'OPENAI_COMPATIBLE_BASE_URL',
];

for (const key of CLOUD_ENV_KEYS) {
  delete process.env[key];
}

process.env.JOBHUNT_DATA_DIR = tempDataDir;
process.env.CAREER_SEEK_ENABLE_OLLAMA = '0';
process.env.CAREER_SEEK_AI_MAX_ATTEMPTS = '1';
process.env.CAREER_SEEK_AI_TIMEOUT_MS = '5000';

const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const rawUrl = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.href
      : input.url;

  try {
    const url = new URL(rawUrl);
    const isLocal =
      url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1' ||
      url.hostname === '::1';

    if ((url.protocol === 'http:' || url.protocol === 'https:') && !isLocal) {
      blockedOutboundFetches.push(url.href);
      throw new Error(`Blocked outbound network call during ATS smoke: ${url.href}`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Blocked outbound')) {
      throw error;
    }
  }

  return originalFetch(input, init);
}) as typeof fetch;

const tailoredResume: FixtureResume = {
  fullName: 'Asha Mehta',
  headline: 'Senior Product Manager | AI Search, Analytics, and B2B SaaS',
  summary:
    'Product manager with 7 years of experience building AI search and analytics products. Strong in customer discovery, roadmap ownership, SQL-backed funnel analysis, experimentation, and cross-functional delivery for B2B SaaS teams.',
  skills: [
    'Product Management',
    'Roadmap',
    'Customer Discovery',
    'Stakeholder Management',
    'SQL',
    'A/B Testing',
    'Analytics',
    'RAG',
    'LLM Evaluation',
    'GTM',
  ],
  tools: ['SQL', 'Amplitude', 'Looker', 'Jira', 'Figma'],
  experience: [
    {
      role: 'Senior Product Manager',
      company: 'NimbusAI',
      duration: '2021 - 2026',
      bullets: [
        'Owned the AI search roadmap for a B2B SaaS workspace used by revenue and support teams.',
        'Led customer discovery with enterprise users and converted themes into PRDs, ranking experiments, and launch plans.',
        'Used SQL, Amplitude, and Looker dashboards to find activation drop-offs and prioritize product bets.',
        'Partnered with engineering and design on RAG retrieval quality, LLM evaluation workflows, and measurable release criteria.',
      ],
    },
    {
      role: 'Product Operations Manager',
      company: 'MetricLoop',
      duration: '2018 - 2021',
      bullets: [
        'Built operating cadences for roadmap reviews, stakeholder updates, and go-to-market readiness.',
        'Analyzed funnel metrics and support themes to recommend lifecycle experiments.',
      ],
    },
  ],
  education: [
    {
      degree: 'MBA, Technology Management',
      institution: 'Indian School of Business',
      year: '2018',
    },
  ],
};

const jdAnalysis: FixtureJdAnalysis = {
  mustHaveSkills: [
    'Product Management',
    'Roadmap',
    'Customer Discovery',
    'SQL',
    'AI Search',
    'Stakeholder Management',
  ],
  preferredSkills: ['RAG', 'LLM Evaluation', 'A/B Testing', 'GTM', 'Enterprise SaaS', 'Kubernetes'],
  atsKeywords: [
    'Senior Product Manager',
    'AI product',
    'analytics',
    'experimentation',
    'customer discovery',
    'roadmap ownership',
    'SOC 2',
  ],
  domainLanguage: ['B2B SaaS', 'retrieval quality', 'enterprise users', 'activation funnel'],
  senioritySignals: ['Ownership', 'Cross-functional delivery', 'Launch planning'],
  leadershipSignals: ['Stakeholder alignment', 'Engineering partnership', 'Design partnership'],
  toolRequirements: ['SQL', 'Amplitude', 'Looker', 'Jira', 'Figma'],
  businessContext:
    'The team is hiring for an AI product role that improves search, recommendations, and analytics workflows for enterprise SaaS customers.',
  hiringPriorities:
    'They need a PM who can translate customer evidence into a roadmap, partner with engineering on AI quality, and measure product outcomes.',
};

const jobContext = {
  id: 4242,
  title: 'Senior Product Manager, AI Search',
  company: 'VectorWorks',
  location: 'Bengaluru / Remote',
  employmentType: 'Full-time',
  snippet:
    'Own the roadmap for AI search and analytics in an enterprise SaaS product. Must show customer discovery, SQL, experimentation, stakeholder management, RAG, and LLM evaluation experience. Kubernetes and SOC 2 familiarity are a plus.',
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertRange(value: number, min: number, max: number, label: string) {
  assert(Number.isFinite(value), `${label} must be numeric; received ${value}`);
  assert(value >= min && value <= max, `${label} expected ${min}-${max}; received ${value}`);
}

function fileUrl(filePath: string) {
  return pathToFileURL(filePath).href;
}

async function importModule(filePath: string) {
  return import(fileUrl(filePath));
}

function firstFunction(module: Record<string, unknown>, names: string[]) {
  for (const name of names) {
    const candidate = module[name];
    if (typeof candidate === 'function') {
      return { name, fn: candidate as (...args: any[]) => any };
    }
  }
  return null;
}

function normalizeScore(result: any) {
  const score =
    result?.atsScore ??
    result?.score ??
    result?.totalScore ??
    result?.compositeScore ??
    result?.overallScore ??
    result?.summary?.score;

  return {
    score: Number(score),
    keywordScore: Number(result?.keywordScore ?? result?.keyword?.score ?? result?.keywordReport?.coveragePct),
    semanticScore: Number(result?.semanticScore ?? result?.semantic?.score ?? result?.semanticSimilarity),
    result,
  };
}

async function runExpectedScorer(module: Record<string, unknown>) {
  const candidate = firstFunction(module, [
    'scoreCompositeAts',
    'computeCompositeAtsScore',
    'scoreResumeAgainstJob',
    'scoreTailoredResumeAgainstJob',
    'scoreAtsFit',
  ]);

  assert(candidate, 'Expected src/lib/ats/scorer.ts to export a composite ATS scoring function.');

  try {
    return await candidate.fn({
      resume: tailoredResume,
      tailoredResume,
      jdAnalysis,
      jobAnalysis: jdAnalysis,
      jobContext,
      jobDescription: jobContext.snippet,
      resumeVector: [0.9, 0.8, 0.7, 0.2, 0.1],
      jobVector: [0.88, 0.82, 0.68, 0.18, 0.12],
    });
  } catch {
    return candidate.fn(tailoredResume, jdAnalysis, jobContext);
  }
}

async function runScorer() {
  if (fs.existsSync(expectedScorerPath)) {
    const scorerModule = await importModule(expectedScorerPath);
    return {
      source: 'src/lib/ats/scorer.ts',
      result: await runExpectedScorer(scorerModule),
      assumptions: [] as string[],
    };
  }

  const currentAtsModule = await import('../../src/lib/services/documents/ats');
  return {
    source: 'src/lib/services/documents/ats.ts',
    result: await currentAtsModule.verifyAtsFit(tailoredResume, jdAnalysis, jobContext),
    assumptions: [
      'src/lib/ats/scorer.ts is not present yet, so this smoke uses the current verifyAtsFit export as the scoring surface.',
    ],
  };
}

function assertBuilderBundle(bundle: any) {
  assert(bundle, 'ATS builder bundle was empty.');
  assert(bundle.kind === 'career-seek.ats-export.v1', 'ATS builder bundle kind is incorrect.');
  assert(typeof bundle.plainText === 'string' && bundle.plainText.includes(tailoredResume.fullName), 'ATS plain text should include the candidate name.');
  assert(bundle.plainText.includes('Product Management'), 'ATS plain text should include a representative skill.');
  assert(bundle.jsonResume?.basics?.name === tailoredResume.fullName, 'JSON Resume basics.name should match the tailored resume.');
  assert(Array.isArray(bundle.jsonResume?.skills) && bundle.jsonResume.skills.length >= 1, 'JSON Resume should include skills.');
  assert(bundle.freshResume, 'FRESH resume output should be present.');
  assert(bundle.hackMyResume, 'HackMyResume metadata should be present.');
}

async function runLegacyDocBuilders(): Promise<Artifact[]> {
  const currentBuilderModule = await import('../../src/lib/services/documents/docx-builder');
  const options = {
    company: jobContext.company,
    title: jobContext.title,
    version: 1,
  };

  return [
    {
      kind: 'docx',
      path: await currentBuilderModule.buildResumeDocx(tailoredResume, jobContext.id, options),
    },
    {
      kind: 'pdf',
      path: await currentBuilderModule.buildResumePdf(tailoredResume, jobContext.id, options),
    },
  ];
}

async function runExpectedBuilder(module: Record<string, unknown>): Promise<{ artifacts: Artifact[]; checks: string[]; assumptions: string[] }> {
  const artifacts: Artifact[] = [];
  const checks: string[] = [];
  const assumptions: string[] = [];

  const bundleBuilder = firstFunction(module, ['buildAtsExportBundle']);
  if (bundleBuilder) {
    const bundle = await bundleBuilder.fn(tailoredResume, {
      generatedAt: '2026-04-30T00:00:00.000Z',
      source: 'phase3-ats-smoke',
      version: 'phase3-smoke',
      job: {
        id: jobContext.id,
        title: jobContext.title,
        company: jobContext.company,
      },
      contact: {
        email: 'asha@example.test',
        location: 'Bengaluru, IN',
      },
    });
    assertBuilderBundle(bundle);
    checks.push('ats_export_bundle');
  }

  const sidecarWriter = firstFunction(module, ['writeAtsSidecarArtifacts']);
  if (sidecarWriter) {
    const generatedDocumentPath = path.join(tempDataDir, 'output/resumes/phase3-ats-smoke.docx');
    fs.mkdirSync(path.dirname(generatedDocumentPath), { recursive: true });
    fs.writeFileSync(generatedDocumentPath, 'placeholder generated resume for ATS sidecar smoke');

    const result = await sidecarWriter.fn(tailoredResume, generatedDocumentPath, {
      generatedAt: '2026-04-30T00:00:00.000Z',
      source: 'phase3-ats-smoke',
      version: 'phase3-smoke',
      basename: 'phase3-ats-smoke',
      writeManifest: true,
      job: {
        id: jobContext.id,
        title: jobContext.title,
        company: jobContext.company,
      },
    });

    const sidecarArtifacts = [
      { kind: 'txt', path: result?.plainTextPath },
      { kind: 'json', path: result?.jsonResumePath },
      { kind: 'json', path: result?.freshResumePath },
      { kind: 'manifest', path: result?.manifestPath },
    ].filter((artifact): artifact is Artifact => (
      ['txt', 'json', 'manifest'].includes(artifact.kind) &&
      typeof artifact.path === 'string' &&
      artifact.path.length > 0
    ));

    artifacts.push(...sidecarArtifacts);
    assertBuilderBundle(result?.bundle);
    checks.push('ats_sidecar_files');
  }

  const combined = firstFunction(module, [
    'buildAtsDocuments',
    'buildTailoredResumeDocuments',
    'buildResumeArtifacts',
    'buildAtsArtifacts',
  ]);

  if (combined) {
    const result = await combined.fn({
      resume: tailoredResume,
      tailoredResume,
      jdAnalysis,
      jobContext,
      atsReport: undefined,
      jobId: jobContext.id,
      version: 1,
    });
    const combinedArtifacts = Array.isArray(result) ? result : Object.values(result || {});
    artifacts.push(...combinedArtifacts
      .map((artifact: any) => ({
        kind: String(artifact?.kind || artifact?.type || artifact?.format || '').toLowerCase(),
        path: artifact?.path || artifact?.filePath || artifact,
      }))
      .filter((artifact): artifact is Artifact => (
        ['docx', 'pdf', 'txt', 'json', 'manifest'].includes(artifact.kind) &&
        typeof artifact.path === 'string'
      )));
    checks.push('combined_artifact_builder');
  }

  const docx = firstFunction(module, ['buildResumeDocx', 'buildDocxResume', 'buildAtsDocx']);
  const pdf = firstFunction(module, ['buildResumePdf', 'buildPdfResume', 'buildAtsPdf']);
  if (docx && pdf) {
    artifacts.push(
      {
        kind: 'docx',
        path: await docx.fn(tailoredResume, jobContext.id, {
          company: jobContext.company,
          title: jobContext.title,
          version: 1,
        }),
      },
      {
        kind: 'pdf',
        path: await pdf.fn(tailoredResume, jobContext.id, {
          company: jobContext.company,
          title: jobContext.title,
          version: 1,
        }),
      },
    );
    checks.push('docx_pdf_builders');
  }

  if (!artifacts.some((artifact) => artifact.kind === 'docx') || !artifacts.some((artifact) => artifact.kind === 'pdf')) {
    artifacts.push(...await runLegacyDocBuilders());
    assumptions.push('src/lib/ats/builder.ts currently provides ATS export/sidecar builders, so current document builders are used for DOCX/PDF artifact checks.');
  }

  assert(checks.length > 0, 'Expected src/lib/ats/builder.ts to expose at least one ATS builder function.');
  return { artifacts, checks, assumptions };
}

async function runBuilder(): Promise<{ source: string; artifacts: Artifact[]; checks: string[]; assumptions: string[] }> {
  if (fs.existsSync(expectedBuilderPath)) {
    const builderModule = await importModule(expectedBuilderPath);
    const result = await runExpectedBuilder(builderModule);
    return {
      source: 'src/lib/ats/builder.ts',
      artifacts: result.artifacts,
      checks: result.checks,
      assumptions: result.assumptions,
    };
  }

  return {
    source: 'src/lib/services/documents/docx-builder.ts',
    artifacts: await runLegacyDocBuilders(),
    checks: ['legacy_docx_pdf_builders'],
    assumptions: [
      'src/lib/ats/builder.ts is not present yet, so this smoke uses the current DOCX/PDF resume builder exports.',
    ],
  };
}

function assertArtifact(artifact: Artifact) {
  assert(artifact.path, `${artifact.kind} builder did not return a file path.`);
  assert(fs.existsSync(artifact.path), `${artifact.kind} artifact was not written: ${artifact.path}`);

  const stat = fs.statSync(artifact.path);
  assert(stat.size > 512, `${artifact.kind} artifact is too small to be useful: ${stat.size} bytes`);

  const buffer = fs.readFileSync(artifact.path);
  if (artifact.kind === 'docx') {
    assert(buffer.subarray(0, 2).toString('utf8') === 'PK', 'DOCX artifact is not a zip/docx payload.');
  }
  if (artifact.kind === 'pdf') {
    assert(buffer.subarray(0, 4).toString('utf8') === '%PDF', 'PDF artifact is missing the PDF header.');
  }
  if (artifact.kind === 'txt') {
    const text = buffer.toString('utf8');
    assert(text.includes(tailoredResume.fullName), 'ATS text sidecar should include the candidate name.');
    assert(text.includes('Product Management'), 'ATS text sidecar should include representative skills.');
  }
  if (artifact.kind === 'json' || artifact.kind === 'manifest') {
    const parsed = JSON.parse(buffer.toString('utf8'));
    assert(parsed && typeof parsed === 'object', `${artifact.kind} artifact should contain valid JSON.`);
  }
}

async function main() {
  const scorer = await runScorer();
  const normalizedScore = normalizeScore(scorer.result);
  assert(scorer.result, 'ATS scorer returned no result.');
  assertRange(normalizedScore.score, 55, 95, 'ATS composite score');

  if (Number.isFinite(normalizedScore.keywordScore)) {
    assertRange(normalizedScore.keywordScore, 45, 100, 'ATS keyword score');
  }

  const keywordReport = normalizedScore.result?.keywordReport;
  if (keywordReport) {
    assertRange(Number(keywordReport.coveragePct), 45, 100, 'ATS keyword coverage');
    assert(
      Array.isArray(keywordReport.matched) && keywordReport.matched.length >= 8,
      'Expected representative matched JD keywords.',
    );
    assert(
      Array.isArray(keywordReport.missing) && keywordReport.missing.length >= 1,
      'Expected at least one honest missing keyword for gap reporting.',
    );
  }

  const builder = await runBuilder();
  assert(builder.artifacts.length >= 2, 'Builder should produce at least DOCX and PDF artifacts.');
  for (const artifact of builder.artifacts) {
    assertArtifact(artifact);
  }

  assert(
    blockedOutboundFetches.length === 0,
    `ATS smoke made unsupported outbound call(s): ${blockedOutboundFetches.join(', ')}`,
  );

  const summary = {
    ok: true,
    scorer: scorer.source,
    builder: builder.source,
    builderChecks: builder.checks,
    score: normalizedScore.score,
    keywordScore: Number.isFinite(normalizedScore.keywordScore) ? normalizedScore.keywordScore : null,
    semanticScore: Number.isFinite(normalizedScore.semanticScore) ? normalizedScore.semanticScore : null,
    artifacts: builder.artifacts.map((artifact) => ({
      kind: artifact.kind,
      bytes: fs.statSync(artifact.path).size,
      path: artifact.path,
    })),
    assumptions: [...scorer.assumptions, ...builder.assumptions],
    noCloudDependency: blockedOutboundFetches.length === 0,
    tempDataDir,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
