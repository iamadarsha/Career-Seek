import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'career-seek-phase4-smoke-'));
const dbDir = path.join(dataDir, 'db');
const blockedFetches: string[] = [];

const CLOUD_ENV_KEYS = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_BASE_URL',
  'CAREER_SEEK_AI_PROVIDER',
  'CAREER_SEEK_AI_MODEL',
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

process.env.JOBHUNT_DATA_DIR = dataDir;
process.env.CAREER_SEEK_ENABLE_OLLAMA = '0';
process.env.CAREER_SEEK_ALLOW_MODEL_DOWNLOADS = '0';
process.env.RESUME_EMBEDDING_PROVIDER = 'keyword-hash';
process.env.JOBHUNT_RAG_MIN_RELEVANCE = '10';

const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const rawUrl = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.href
      : input.url;
  const url = new URL(rawUrl);
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);

  if ((url.protocol === 'http:' || url.protocol === 'https:') && !isLocal) {
    blockedFetches.push(url.href);
    throw new Error(`Blocked outbound fetch during Phase 4 smoke: ${url.href}`);
  }

  return originalFetch(input, init);
}) as typeof fetch;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function createSchema(db: Database.Database) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      external_id TEXT UNIQUE,
      email TEXT,
      display_name TEXT,
      is_bootstrap INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE user_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      name TEXT NOT NULL DEFAULT 'Default',
      headline TEXT,
      is_default INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE uploaded_resumes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER REFERENCES user_profiles(id),
      filename TEXT NOT NULL,
      original_path TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      parsed_text TEXT,
      parse_metadata TEXT,
      uploaded_at INTEGER NOT NULL
    );

    CREATE TABLE master_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER REFERENCES user_profiles(id),
      full_name TEXT,
      headline TEXT,
      years_of_experience INTEGER,
      target_seniority TEXT,
      skills_explicit TEXT,
      skills_inferred TEXT,
      tools TEXT,
      domains TEXT,
      experience TEXT,
      projects TEXT,
      achievements TEXT,
      education TEXT,
      certifications TEXT,
      strengths TEXT,
      gaps TEXT,
      raw_summary TEXT,
      updated_at INTEGER
    );

    CREATE TABLE search_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER REFERENCES user_profiles(id),
      title TEXT NOT NULL,
      locations TEXT,
      work_model TEXT,
      expected_salary TEXT,
      experience_band TEXT,
      company_types TEXT,
      preferred_portals TEXT,
      must_have_keywords TEXT,
      avoid_keywords TEXT,
      notice_period TEXT,
      relocation_willingness INTEGER,
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE scans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER REFERENCES user_profiles(id),
      search_profile_id INTEGER REFERENCES search_profiles(id),
      status TEXT NOT NULL DEFAULT 'queued',
      started_at INTEGER,
      finished_at INTEGER,
      total_jobs INTEGER DEFAULT 0,
      error TEXT
    );

    CREATE TABLE normalized_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER REFERENCES user_profiles(id),
      scan_id INTEGER NOT NULL REFERENCES scans(id),
      search_profile_id INTEGER NOT NULL REFERENCES search_profiles(id),
      portal TEXT NOT NULL,
      external_id TEXT,
      title TEXT NOT NULL,
      company TEXT NOT NULL,
      location TEXT,
      is_remote INTEGER,
      is_hybrid INTEGER,
      salary_raw TEXT,
      salary_min INTEGER,
      salary_max INTEGER,
      salary_currency TEXT,
      experience_raw TEXT,
      experience_min INTEGER,
      experience_max INTEGER,
      url TEXT NOT NULL,
      apply_url TEXT,
      posted_date_raw TEXT,
      posted_date INTEGER,
      snippet TEXT,
      employment_type TEXT,
      raw_payload_path TEXT,
      scraped_at INTEGER NOT NULL
    );

    CREATE TABLE scored_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER REFERENCES user_profiles(id),
      normalized_job_id INTEGER NOT NULL UNIQUE REFERENCES normalized_jobs(id),
      master_profile_id INTEGER NOT NULL REFERENCES master_profiles(id),
      search_profile_id INTEGER NOT NULL REFERENCES search_profiles(id),
      score INTEGER NOT NULL,
      tier TEXT NOT NULL,
      breakdown TEXT,
      scored_at INTEGER NOT NULL
    );

    CREATE TABLE job_enrichments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scored_job_id INTEGER NOT NULL UNIQUE REFERENCES scored_jobs(id),
      fit_summary TEXT,
      pros TEXT,
      cons TEXT,
      interview_angle TEXT,
      salary_estimate TEXT,
      resume_focus TEXT,
      enriched_at INTEGER NOT NULL
    );

    CREATE TABLE search_queries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER REFERENCES user_profiles(id),
      query TEXT NOT NULL,
      results TEXT,
      timestamp INTEGER NOT NULL
    );

    CREATE TABLE jd_analyses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scored_job_id INTEGER NOT NULL UNIQUE REFERENCES scored_jobs(id),
      must_have_skills TEXT,
      preferred_skills TEXT,
      ats_keywords TEXT,
      domain_language TEXT,
      seniority_signals TEXT,
      leadership_signals TEXT,
      tool_requirements TEXT,
      business_context TEXT,
      hiring_priorities TEXT,
      analyzed_at INTEGER NOT NULL
    );

    CREATE TABLE document_assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER REFERENCES user_profiles(id),
      scored_job_id INTEGER NOT NULL REFERENCES scored_jobs(id),
      type TEXT NOT NULL,
      content TEXT,
      file_path TEXT,
      ats_score INTEGER,
      version INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE document_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER REFERENCES user_profiles(id),
      chunk_id TEXT NOT NULL UNIQUE,
      source_type TEXT NOT NULL,
      source_id INTEGER,
      scored_job_id INTEGER,
      section TEXT,
      content TEXT NOT NULL,
      metadata TEXT,
      embedding TEXT,
      embedding_provider TEXT,
      embedding_model TEXT,
      embedding_dimensions INTEGER,
      embedding_mode TEXT,
      token_count INTEGER,
      indexed_at INTEGER NOT NULL
    );

    CREATE TABLE index_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER REFERENCES user_profiles(id),
      source_type TEXT NOT NULL,
      source_id INTEGER,
      embedding_provider TEXT,
      embedding_model TEXT,
      embedding_dimensions INTEGER,
      embedding_mode TEXT,
      chunks_created INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      started_at INTEGER,
      finished_at INTEGER,
      error TEXT
    );

    CREATE TABLE applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER REFERENCES user_profiles(id),
      scored_job_id INTEGER REFERENCES scored_jobs(id),
      normalized_job_id INTEGER REFERENCES normalized_jobs(id),
      title TEXT NOT NULL,
      company TEXT NOT NULL,
      location TEXT,
      portal TEXT,
      url TEXT,
      apply_url TEXT,
      status TEXT NOT NULL DEFAULT 'saved',
      previous_status TEXT,
      score_snapshot INTEGER,
      tier_snapshot TEXT,
      saved_at INTEGER NOT NULL,
      applied_at INTEGER,
      last_status_change_at INTEGER,
      next_follow_up_at INTEGER,
      tags TEXT,
      priority TEXT DEFAULT 'normal',
      archived_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
}

async function seedFixture() {
  fs.mkdirSync(dbDir, { recursive: true });
  const sqlite = new Database(path.join(dbDir, 'jobhunt.db'));
  createSchema(sqlite);
  sqlite.close();

  const schema = await import('../../src/db/schema');
  const { getDb } = await import('../../src/db');
  const db = getDb();
  const now = new Date();

  db.insert(schema.users).values({
    id: 1,
    displayName: 'Phase 4 QA',
    isBootstrap: true,
    createdAt: now,
    updatedAt: now,
  }).run();

  db.insert(schema.userProfiles).values({
    id: 1,
    userId: 1,
    name: 'Default',
    headline: 'Product manager for AI search and analytics',
    isDefault: true,
    createdAt: now,
    updatedAt: now,
  }).run();

  const master = db.insert(schema.masterProfiles).values({
    profileId: 1,
    fullName: 'Asha Mehta',
    headline: 'Senior Product Manager, AI Search',
    yearsOfExperience: 7,
    targetSeniority: 'Senior',
    skillsExplicit: JSON.stringify(['Product Management', 'AI Search', 'SQL', 'Analytics', 'RAG', 'LLM Evaluation']),
    tools: JSON.stringify(['SQL', 'Looker', 'Amplitude', 'Figma']),
    domains: JSON.stringify(['B2B SaaS', 'Enterprise Search']),
    experience: JSON.stringify([
      {
        role: 'Senior Product Manager',
        company: 'NimbusAI',
        duration: '2021-2026',
        summary: 'Owned AI search, ranking experiments, customer discovery, and analytics workflows.',
      },
    ]),
    projects: JSON.stringify([
      {
        name: 'Local RAG evaluator',
        description: 'Improved retrieval quality and launch confidence for enterprise search.',
        technologies: ['RAG', 'LLM evaluation', 'SQL'],
      },
    ]),
    achievements: JSON.stringify(['Improved activation by 18% through search ranking experiments.']),
    rawSummary: 'PM with strong AI search, analytics, SQL, customer discovery, and RAG evaluation experience.',
    updatedAt: now,
  }).returning().get();

  const search = db.insert(schema.searchProfiles).values({
    profileId: 1,
    title: 'Senior Product Manager AI Search',
    locations: JSON.stringify(['Bengaluru', 'Remote']),
    workModel: 'hybrid',
    mustHaveKeywords: JSON.stringify(['AI Search', 'SQL', 'Analytics', 'RAG']),
    preferredPortals: JSON.stringify(['linkedin', 'wellfound']),
    isActive: true,
  }).returning().get();

  db.insert(schema.uploadedResumes).values({
    profileId: 1,
    filename: 'asha-resume.txt',
    originalPath: path.join(dataDir, 'asha-resume.txt'),
    mimeType: 'text/plain',
    parsedText: [
      'Asha Mehta, Senior Product Manager for AI search and analytics.',
      'Experience includes SQL-backed funnel analysis, customer discovery, RAG quality evaluation, roadmap ownership, and B2B SaaS launches.',
    ].join('\n\n'),
    parseMetadata: JSON.stringify({ qa: true }),
    uploadedAt: now,
  }).run();

  const scan = db.insert(schema.scans).values({
    profileId: 1,
    searchProfileId: search.id,
    status: 'complete',
    startedAt: now,
    finishedAt: now,
    totalJobs: 2,
  }).returning().get();

  const topJob = db.insert(schema.normalizedJobs).values({
    profileId: 1,
    scanId: scan.id,
    searchProfileId: search.id,
    portal: 'local-fixture',
    externalId: 'phase4-ai-search-pm',
    title: 'Senior Product Manager, AI Search',
    company: 'VectorWorks',
    location: 'Bengaluru Hybrid',
    isRemote: false,
    isHybrid: true,
    url: 'http://localhost/jobs/vectorworks-ai-search',
    applyUrl: 'http://localhost/apply/vectorworks-ai-search',
    snippet: 'Own AI search, RAG ranking quality, customer discovery, SQL analytics, and LLM evaluation for B2B SaaS.',
    employmentType: 'Full-time',
    scrapedAt: now,
  }).returning().get();

  const otherJob = db.insert(schema.normalizedJobs).values({
    profileId: 1,
    scanId: scan.id,
    searchProfileId: search.id,
    portal: 'local-fixture',
    externalId: 'phase4-sales',
    title: 'Enterprise Account Executive',
    company: 'QuotaCloud',
    location: 'Mumbai',
    isRemote: false,
    isHybrid: false,
    url: 'http://localhost/jobs/quota-ae',
    snippet: 'Own outbound pipeline and enterprise quota for HR software.',
    employmentType: 'Full-time',
    scrapedAt: now,
  }).returning().get();

  const topScored = db.insert(schema.scoredJobs).values({
    profileId: 1,
    normalizedJobId: topJob.id,
    masterProfileId: master.id,
    searchProfileId: search.id,
    score: 93,
    tier: 'A',
    breakdown: JSON.stringify({ qa: true, reason: 'Strong AI search and analytics overlap.' }),
    scoredAt: now,
  }).returning().get();

  const otherScored = db.insert(schema.scoredJobs).values({
    profileId: 1,
    normalizedJobId: otherJob.id,
    masterProfileId: master.id,
    searchProfileId: search.id,
    score: 49,
    tier: 'C',
    breakdown: JSON.stringify({ qa: true, reason: 'Weak product and AI overlap.' }),
    scoredAt: now,
  }).returning().get();

  db.insert(schema.jdAnalyses).values({
    scoredJobId: topScored.id,
    mustHaveSkills: JSON.stringify(['AI Search', 'SQL', 'RAG', 'Customer Discovery']),
    preferredSkills: JSON.stringify(['LLM Evaluation', 'B2B SaaS']),
    atsKeywords: JSON.stringify(['AI product', 'analytics', 'roadmap ownership']),
    domainLanguage: JSON.stringify(['retrieval quality', 'enterprise search']),
    businessContext: 'The team needs a PM to improve AI search and analytics workflows.',
    hiringPriorities: 'Customer discovery, SQL-backed prioritization, and reliable RAG evaluation.',
    analyzedAt: now,
  }).run();

  db.insert(schema.jobEnrichments).values({
    scoredJobId: topScored.id,
    fitSummary: 'Strong overlap with AI search, SQL analytics, and RAG evaluation.',
    pros: JSON.stringify(['Direct domain match', 'Strong analytics evidence']),
    cons: JSON.stringify(['Needs to show enterprise depth clearly']),
    interviewAngle: 'Prepare examples of ranking quality and RAG evaluation tradeoffs.',
    resumeFocus: 'Lead with AI search roadmap, SQL analysis, and customer discovery.',
    enrichedAt: now,
  }).run();

  return {
    schema,
    db,
    topScoredId: topScored.id,
    otherScoredId: otherScored.id,
    scoredJobsForSearch: [
      { id: topScored.id, score: 93, tier: 'A', normalizedJob: topJob },
      { id: otherScored.id, score: 49, tier: 'C', normalizedJob: otherJob },
    ],
  };
}

async function run() {
  const fixture = await seedFixture();
  const { executeAiSearch } = await import('../../src/lib/services/scoring/ai-search');
  const semantic = await import('../../src/lib/services/scoring/semantic-match');
  const coachEmbedder = await import('../../src/lib/services/coach/embedder');
  const coachAnswer = await import('../../src/lib/services/coach/answer');

  assert(typeof executeAiSearch === 'function', 'executeAiSearch export is missing.');
  const searchResults = await executeAiSearch('remote AI search PM with SQL analytics in Bangalore', fixture.scoredJobsForSearch);
  assert(searchResults.length > 0, 'Job search fallback returned no local results.');
  assert(searchResults[0].id === fixture.topScoredId, 'Job search fallback did not rank the AI search PM job first.');
  assert(searchResults.every((result) => result.source === 'local'), 'Job search fallback should remain local with no provider configured.');

  assert(typeof semantic.compareResumeToJobSemanticMatch === 'function', 'compareResumeToJobSemanticMatch export is missing.');
  const semanticResult = await semantic.compareResumeToJobSemanticMatch({
    resumeText: 'Senior PM with AI search, RAG evaluation, SQL analytics, customer discovery, and B2B SaaS roadmap ownership.',
    jobText: 'Hiring a Senior Product Manager for AI search, RAG ranking quality, SQL analytics, and customer discovery.',
    embeddingProvider: {
      id: 'qa-external-provider',
      mode: 'external_embedding',
      dimensions: 0,
      requiresApiKey: true,
      async embed() {
        throw new Error('External provider should not be called in local smoke.');
      },
    },
  });
  assert(semanticResult.mode === 'local_keyword_hash', 'Dream-job semantic ranking did not fall back to local keyword-hash mode.');
  assert(semanticResult.similarityPct > 0, 'Dream-job semantic fallback produced a zero similarity score.');
  assert(
    semanticResult.warnings.some((warning: string) => warning.includes('not local-only')),
    'Dream-job semantic fallback did not report the non-local provider warning.',
  );

  if (typeof coachEmbedder.indexDocuments === 'function' && typeof coachAnswer.generateGroundedAnswer === 'function') {
    const indexResult = await coachEmbedder.indexDocuments({
      includeProfile: true,
      scoredJobId: fixture.topScoredId,
      forceReindex: true,
    });
    assert(!indexResult.error, `Coach index returned an error: ${indexResult.error}`);
    assert(indexResult.chunksCreated > 0, 'Coach index created no local chunks.');

    const response = await coachAnswer.generateGroundedAnswer(
      'How does my background fit this AI search role?',
      'job_and_profile',
      fixture.topScoredId,
      [],
      'concise',
    );
    assert(response.sources.length > 0, 'Coach no-key fallback returned no retrieved sources.');
    assert(response.answer.confidenceLevel === 'low', 'Coach no-key fallback should use low confidence evidence-only mode.');
    assert(
      /could not produce a full generated coaching answer|evidence/i.test(response.answer.answer),
      'Coach no-key fallback did not return an evidence-only answer.',
    );
  }

  assert(blockedFetches.length === 0, `Smoke attempted non-local fetches: ${blockedFetches.join(', ')}`);

  const persistedSearch = fixture.db.select().from(fixture.schema.searchQueries).all();
  assert(persistedSearch.length === 1, 'Expected local search query to be persisted in the isolated DB.');

  console.log(JSON.stringify({
    ok: true,
    dataDir,
    checks: {
      jobSearchFallback: {
        firstResultId: searchResults[0].id,
        resultCount: searchResults.length,
        source: searchResults[0].source,
      },
      dreamJobRankingFallback: {
        mode: semanticResult.mode,
        provider: semanticResult.provider,
        similarityPct: semanticResult.similarityPct,
      },
      coachNoKey: {
        indexedChunks: coachEmbedder.getIndexStatus?.().totalChunks ?? null,
      },
      blockedFetches,
    },
  }, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
