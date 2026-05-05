import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Document, Packer, Paragraph, TextRun } from 'docx';

const repoRoot = process.cwd();
const QA_PORTAL = 'qa_seed';
const RESULT_PREFIX = 'QA_PROOF_RESULT ';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

type AiMode = 'auto' | 'off';
type CoachMode = 'auto' | 'off';
type ProviderProofName =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'groq'
  | 'deepseek'
  | 'openai-compatible'
  | 'ollama'
  | 'deterministic';

interface CandidateProfile {
  fullName: string;
  headline: string;
  yearsOfExperience: number;
  targetSeniority: string;
  skills: {
    explicit: string[];
    inferred: string[];
  };
  tools: string[];
  domains: string[];
  experience: Array<{
    role: string;
    company: string;
    duration: string;
    summary: string;
  }>;
  projects: Array<{
    name: string;
    description: string;
    technologies: string[];
  }>;
  achievements: string[];
  education: Array<{
    degree: string;
    institution: string;
    year: string;
  }>;
  certifications: string[];
  strengths: string[];
  gaps: string[];
  rawSummary: string;
  metadata: {
    confidenceNotes: string;
  };
}

interface CandidateFixture {
  slug: string;
  label: string;
  email: string;
  phone: string;
  location: string;
  profile: CandidateProfile;
  preferences: {
    title: string;
    locations: string[];
    workModel: string;
    expectedSalary: string;
    experienceBand: string;
    companyTypes: string[];
    mustHaveKeywords: string[];
    avoidKeywords: string[];
    noticePeriod: string;
    relocationWillingness: boolean;
  };
  qaJob: {
    title: string;
    company: string;
    location: string;
    isRemote?: boolean;
    isHybrid?: boolean;
    salaryRaw: string;
    experienceRaw: string;
    experienceMin: number;
    experienceMax: number;
    url: string;
    snippet: string;
    employmentType: string;
  };
}

interface CliOptions {
  candidate?: string;
  dataRoot: string;
  reportPath: string;
  aiMode: AiMode;
  coachMode: CoachMode;
  childTimeoutMs: number;
  keepData: boolean;
  help: boolean;
}

interface ProviderProofStatus {
  provider: ProviderProofName;
  label: string;
  kind: 'cloud' | 'compatible' | 'local' | 'fallback';
  configured: boolean;
  source: string;
  proofSupport: 'exercised' | 'metadata_only' | 'fallback';
  note: string;
}

const candidates: CandidateFixture[] = [
  {
    slug: 'sde-4y',
    label: '4-year SDE',
    email: 'rohan.nair@example.com',
    phone: '+91 90000 10001',
    location: 'Bengaluru, India',
    profile: {
      fullName: 'Rohan Nair',
      headline: 'Software Development Engineer with 4 years in backend and full-stack SaaS',
      yearsOfExperience: 4,
      targetSeniority: 'Mid-level',
      skills: {
        explicit: [
          'TypeScript',
          'React',
          'Node.js',
          'Express',
          'PostgreSQL',
          'REST APIs',
          'System design',
          'AWS',
          'Docker',
          'CI/CD',
          'Unit testing',
          'Distributed systems',
        ],
        inferred: [
          'API performance tuning',
          'Observability',
          'Secure coding',
          'Cross-functional collaboration',
        ],
      },
      tools: [
        'Next.js',
        'NestJS',
        'Prisma',
        'Drizzle ORM',
        'PostgreSQL',
        'Redis',
        'AWS Lambda',
        'SQS',
        'CloudWatch',
        'GitHub Actions',
        'Playwright',
        'Jest',
      ],
      domains: ['Fintech', 'B2B SaaS', 'Payments'],
      experience: [
        {
          role: 'Software Development Engineer',
          company: 'PayBridge Labs',
          duration: 'Jul 2022 - Present',
          summary: 'Builds TypeScript services for payment reconciliation, partner APIs, and dashboard workflows used by finance operations teams.',
        },
        {
          role: 'Associate Software Engineer',
          company: 'CloudCart Systems',
          duration: 'Jun 2020 - Jun 2022',
          summary: 'Worked on React dashboards, Node.js services, PostgreSQL schemas, and automated regression tests for commerce workflows.',
        },
      ],
      projects: [
        {
          name: 'Ledger Reconciliation Worker',
          description: 'Designed idempotent queues and retry-safe workers for payment settlement reconciliation.',
          technologies: ['TypeScript', 'SQS', 'PostgreSQL', 'AWS Lambda'],
        },
        {
          name: 'Merchant Risk Console',
          description: 'Built a React and Next.js console for support teams to inspect risk signals and API traces.',
          technologies: ['React', 'Next.js', 'Redis', 'Playwright'],
        },
      ],
      achievements: [
        'Reduced reconciliation job runtime from 42 minutes to 11 minutes by batching partner API calls and optimizing SQL indexes.',
        'Raised automated regression coverage for checkout APIs from 45 percent to 82 percent.',
        'Cut production alert noise by grouping CloudWatch alarms around customer-impacting failure modes.',
      ],
      education: [
        {
          degree: 'B.Tech Computer Science',
          institution: 'Vellore Institute of Technology',
          year: '2020',
        },
      ],
      certifications: ['AWS Developer Associate', 'Advanced TypeScript Patterns'],
      strengths: ['Reliable backend delivery', 'Full-stack debugging', 'Production ownership'],
      gaps: ['No explicit people-management experience yet; prefers hands-on IC roles.'],
      rawSummary: 'Rohan is a 4-year software engineer focused on TypeScript, Node.js, React, PostgreSQL, AWS, and payments SaaS systems.',
      metadata: {
        confidenceNotes: 'Curated QA profile with detailed service, project, and metric coverage.',
      },
    },
    preferences: {
      title: 'Software Development Engineer II',
      locations: ['Bengaluru', 'Hyderabad', 'Remote India'],
      workModel: 'hybrid',
      expectedSalary: 'INR 22-32 LPA',
      experienceBand: '3-5 years',
      companyTypes: ['fintech', 'B2B SaaS', 'developer tools'],
      mustHaveKeywords: ['TypeScript', 'Node.js', 'React', 'AWS', 'PostgreSQL'],
      avoidKeywords: ['intern', 'trainee', 'manual testing only'],
      noticePeriod: '30 days',
      relocationWillingness: false,
    },
    qaJob: {
      title: 'Software Development Engineer II',
      company: 'Nimbus Payments Platform',
      location: 'Bengaluru, Hybrid',
      isHybrid: true,
      salaryRaw: 'INR 24-34 LPA',
      experienceRaw: '3-5 years',
      experienceMin: 3,
      experienceMax: 5,
      url: 'https://example.com/qa/sde-ii-nimbus-payments',
      snippet: 'Own TypeScript and Node.js backend services, React internal tools, PostgreSQL data models, AWS queues, CI/CD, test automation, API reliability, and payment workflow observability.',
      employmentType: 'full_time',
    },
  },
  {
    slug: 'pm-4y',
    label: '4-year PM',
    email: 'maya.iyer@example.com',
    phone: '+91 90000 10002',
    location: 'Mumbai, India',
    profile: {
      fullName: 'Maya Iyer',
      headline: 'Product Manager with 4 years across B2B SaaS growth and analytics-led roadmap execution',
      yearsOfExperience: 4,
      targetSeniority: 'Mid-level',
      skills: {
        explicit: [
          'Product strategy',
          'Roadmapping',
          'PRDs',
          'SQL',
          'Product analytics',
          'Experimentation',
          'User research',
          'Stakeholder management',
          'Go-to-market',
        ],
        inferred: [
          'Prioritization',
          'Activation analysis',
          'Sales enablement',
          'Funnel optimization',
        ],
      },
      tools: ['Mixpanel', 'Amplitude', 'Jira', 'Figma', 'Notion', 'Looker', 'Google Analytics', 'PostgreSQL'],
      domains: ['B2B SaaS', 'Sales productivity', 'Fintech onboarding'],
      experience: [
        {
          role: 'Product Manager',
          company: 'RevOpsly',
          duration: 'Aug 2022 - Present',
          summary: 'Owns sales workflow automation, activation funnels, roadmap tradeoffs, and GTM launch planning for mid-market SaaS customers.',
        },
        {
          role: 'Associate Product Manager',
          company: 'KiteFin',
          duration: 'Jul 2020 - Jul 2022',
          summary: 'Supported onboarding experiments, analytics instrumentation, PRDs, user interviews, and cross-functional delivery rituals.',
        },
      ],
      projects: [
        {
          name: 'Self-Serve Activation Redesign',
          description: 'Researched onboarding drop-offs, shipped guided setup, and instrumented activation cohorts.',
          technologies: ['Mixpanel', 'SQL', 'Figma', 'Jira'],
        },
        {
          name: 'Pipeline Health Score',
          description: 'Defined a scoring model for sales managers to prioritize stale opportunities and next actions.',
          technologies: ['Looker', 'PostgreSQL', 'Notion'],
        },
      ],
      achievements: [
        'Improved trial-to-paid activation from 18 percent to 27 percent through guided onboarding and lifecycle nudges.',
        'Reduced sales manager weekly reporting time by 6 hours with pipeline health dashboards.',
        'Launched three roadmap releases with coordinated enablement for sales, support, and customer success.',
      ],
      education: [
        {
          degree: 'BBA Information Systems',
          institution: 'NMIMS Mumbai',
          year: '2020',
        },
      ],
      certifications: ['Reforge Growth Series', 'SQL for Product Managers'],
      strengths: ['Analytics-led product decisions', 'Clear PRDs', 'GTM alignment'],
      gaps: ['Limited direct ownership of AI-native product surfaces.'],
      rawSummary: 'Maya is a 4-year Product Manager focused on B2B SaaS growth, SQL analytics, roadmap execution, user research, and GTM launches.',
      metadata: {
        confidenceNotes: 'Curated QA profile with PM metrics, tools, and launch experience.',
      },
    },
    preferences: {
      title: 'Product Manager',
      locations: ['Mumbai', 'Bengaluru', 'Remote India'],
      workModel: 'remote',
      expectedSalary: 'INR 24-36 LPA',
      experienceBand: '3-5 years',
      companyTypes: ['B2B SaaS', 'fintech', 'AI productivity'],
      mustHaveKeywords: ['Product analytics', 'SQL', 'Roadmap', 'Experimentation', 'GTM'],
      avoidKeywords: ['intern', 'pure project coordinator', 'sales quota'],
      noticePeriod: '45 days',
      relocationWillingness: true,
    },
    qaJob: {
      title: 'Product Manager - Growth SaaS',
      company: 'Orbit Growth Cloud',
      location: 'Remote India',
      isRemote: true,
      salaryRaw: 'INR 25-38 LPA',
      experienceRaw: '3-6 years',
      experienceMin: 3,
      experienceMax: 6,
      url: 'https://example.com/qa/product-manager-orbit-growth',
      snippet: 'Lead roadmap discovery for activation and retention, write PRDs, use SQL and product analytics, run experiments, partner with design, engineering, sales, support, and GTM teams.',
      employmentType: 'full_time',
    },
  },
  {
    slug: 'uiux-designer',
    label: 'UI/UX designer',
    email: 'tara.sen@example.com',
    phone: '+91 90000 10003',
    location: 'Delhi NCR, India',
    profile: {
      fullName: 'Tara Sen',
      headline: 'UI/UX Designer with 4 years in design systems, research, prototypes, and accessible SaaS workflows',
      yearsOfExperience: 4,
      targetSeniority: 'Mid-level',
      skills: {
        explicit: [
          'User research',
          'Interaction design',
          'Visual design',
          'Design systems',
          'Wireframing',
          'Prototyping',
          'Usability testing',
          'Accessibility',
          'UX writing',
        ],
        inferred: [
          'Product discovery',
          'Information architecture',
          'Stakeholder facilitation',
          'Design QA',
        ],
      },
      tools: ['Figma', 'FigJam', 'Miro', 'Maze', 'Hotjar', 'Notion', 'Jira', 'Storybook'],
      domains: ['Healthtech', 'B2B SaaS', 'Mobile apps'],
      experience: [
        {
          role: 'Product Designer',
          company: 'CareLoop Health',
          duration: 'May 2022 - Present',
          summary: 'Designs patient intake, clinician dashboard, and care coordination workflows with research-backed prototypes and accessibility checks.',
        },
        {
          role: 'UI/UX Designer',
          company: 'TaskMint',
          duration: 'Jul 2020 - Apr 2022',
          summary: 'Created mobile onboarding flows, reusable Figma components, usability studies, and handoff specs for a productivity SaaS team.',
        },
      ],
      projects: [
        {
          name: 'Clinician Task Board Redesign',
          description: 'Mapped care-team workflows, prototyped a priority board, and delivered a tokenized component set.',
          technologies: ['Figma', 'Maze', 'Storybook'],
        },
        {
          name: 'Mobile First-Time User Experience',
          description: 'Reduced onboarding confusion through progressive disclosure, better empty states, and concise UX writing.',
          technologies: ['Figma', 'Hotjar', 'Miro'],
        },
      ],
      achievements: [
        'Improved task completion in moderated usability tests from 62 percent to 88 percent after redesigning clinician workflows.',
        'Built a Figma component library adopted by 7 product squads.',
        'Reduced design QA defects by 35 percent through interaction specs and accessibility checklists.',
      ],
      education: [
        {
          degree: 'B.Des Communication Design',
          institution: 'Srishti Institute of Art, Design and Technology',
          year: '2020',
        },
      ],
      certifications: ['NN/g UX Research Methods', 'Deque Accessibility Fundamentals'],
      strengths: ['Research synthesis', 'Design systems', 'Accessible product craft'],
      gaps: ['Portfolio link and latest case study status should be confirmed before outreach.'],
      rawSummary: 'Tara is a 4-year UI/UX Designer focused on Figma, design systems, user research, accessibility, prototypes, and SaaS workflow design.',
      metadata: {
        confidenceNotes: 'Curated QA profile with design process, tools, and measurable outcomes.',
      },
    },
    preferences: {
      title: 'Product Designer UI UX',
      locations: ['Delhi NCR', 'Bengaluru', 'Remote India'],
      workModel: 'remote',
      expectedSalary: 'INR 18-28 LPA',
      experienceBand: '3-5 years',
      companyTypes: ['healthtech', 'B2B SaaS', 'design-led startups'],
      mustHaveKeywords: ['Figma', 'Design systems', 'User research', 'Accessibility', 'Prototyping'],
      avoidKeywords: ['graphic designer only', 'print design', 'intern'],
      noticePeriod: '30 days',
      relocationWillingness: false,
    },
    qaJob: {
      title: 'Product Designer - UI/UX',
      company: 'Luma Health Design',
      location: 'Remote India',
      isRemote: true,
      salaryRaw: 'INR 19-29 LPA',
      experienceRaw: '3-5 years',
      experienceMin: 3,
      experienceMax: 5,
      url: 'https://example.com/qa/product-designer-luma-health',
      snippet: 'Create Figma prototypes, run user research, maintain design systems, improve WCAG-minded UX quality, write interaction specs, partner with product and engineering on clinician-facing SaaS workflows.',
      employmentType: 'full_time',
    },
  },
  {
    slug: 'hr-4y',
    label: 'HR',
    email: 'kabir.sharma@example.com',
    phone: '+91 90000 10004',
    location: 'Pune, India',
    profile: {
      fullName: 'Kabir Sharma',
      headline: 'HR Generalist with 4 years in talent acquisition, onboarding, engagement, HRIS, and people operations',
      yearsOfExperience: 4,
      targetSeniority: 'Mid-level',
      skills: {
        explicit: [
          'Talent acquisition',
          'Interview coordination',
          'Onboarding',
          'Employee engagement',
          'HR operations',
          'HRIS',
          'Payroll coordination',
          'Policy documentation',
          'People analytics',
          'Compliance',
        ],
        inferred: [
          'Stakeholder management',
          'Candidate experience',
          'Process improvement',
          'Employee relations',
        ],
      },
      tools: ['Darwinbox', 'Keka', 'Greenhouse', 'LinkedIn Recruiter', 'Google Workspace', 'Excel', 'Slack', 'Notion'],
      domains: ['IT services', 'SaaS', 'Startup operations'],
      experience: [
        {
          role: 'HR Generalist',
          company: 'BrightOps Technologies',
          duration: 'Sep 2022 - Present',
          summary: 'Handles hiring coordination, onboarding, HRIS hygiene, employee engagement programs, policy updates, and monthly people dashboards.',
        },
        {
          role: 'Talent Acquisition Associate',
          company: 'TalentNest Services',
          duration: 'Jul 2020 - Aug 2022',
          summary: 'Supported lateral hiring, campus drives, candidate communication, interview scheduling, and offer documentation for technology roles.',
        },
      ],
      projects: [
        {
          name: 'Onboarding Journey Standardization',
          description: 'Created pre-joining checklists, buddy assignment, induction cadence, and first-30-day feedback loops.',
          technologies: ['Darwinbox', 'Notion', 'Google Forms'],
        },
        {
          name: 'Hiring Funnel Dashboard',
          description: 'Built weekly hiring metrics for source mix, interview aging, offer acceptance, and joining risk.',
          technologies: ['Excel', 'Greenhouse', 'Google Sheets'],
        },
      ],
      achievements: [
        'Reduced average interview scheduling turnaround from 4 days to 1.5 days through slot templates and escalation rules.',
        'Improved 30-day onboarding satisfaction from 78 percent to 91 percent.',
        'Coordinated hiring for 85 technology and operations roles across two years.',
      ],
      education: [
        {
          degree: 'MBA Human Resources',
          institution: 'Symbiosis Institute of Business Management',
          year: '2020',
        },
      ],
      certifications: ['SHRM Talent Acquisition Specialty', 'Advanced Excel for HR Analytics'],
      strengths: ['Candidate experience', 'HR operations rigor', 'People dashboarding'],
      gaps: ['Compensation benchmarking exposure is present but not deeply specialized.'],
      rawSummary: 'Kabir is a 4-year HR professional focused on hiring coordination, onboarding, engagement, HRIS, compliance, and people analytics.',
      metadata: {
        confidenceNotes: 'Curated QA profile with HR operations, recruiting, and engagement metrics.',
      },
    },
    preferences: {
      title: 'HR Generalist HR Business Partner',
      locations: ['Pune', 'Mumbai', 'Remote India'],
      workModel: 'hybrid',
      expectedSalary: 'INR 12-18 LPA',
      experienceBand: '3-5 years',
      companyTypes: ['SaaS', 'IT services', 'startup'],
      mustHaveKeywords: ['HRIS', 'Onboarding', 'Employee engagement', 'Talent acquisition', 'People analytics'],
      avoidKeywords: ['intern', 'commission only recruiter', 'night shift only'],
      noticePeriod: '30 days',
      relocationWillingness: true,
    },
    qaJob: {
      title: 'HR Generalist - People Operations',
      company: 'PeopleOps Cloud',
      location: 'Pune, Hybrid',
      isHybrid: true,
      salaryRaw: 'INR 13-19 LPA',
      experienceRaw: '3-5 years',
      experienceMin: 3,
      experienceMax: 5,
      url: 'https://example.com/qa/hr-generalist-peopleops-cloud',
      snippet: 'Own HRIS data quality, employee onboarding, engagement programs, talent acquisition coordination, people analytics dashboards, compliance documentation, payroll coordination, and manager support.',
      employmentType: 'full_time',
    },
  },
];

function parseArgs(argv: string[]): CliOptions {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const options: CliOptions = {
    dataRoot: path.join(os.tmpdir(), 'career-seek-qa-proof', timestamp),
    reportPath: path.join(repoRoot, 'docs', 'qa', 'proof-harness-last-run.json'),
    aiMode: 'auto',
    coachMode: 'auto',
    childTimeoutMs: 240_000,
    keepData: true,
    help: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    const readValue = () => {
      const inline = arg.split('=')[1];
      if (inline !== undefined) return inline;
      index++;
      return argv[index];
    };

    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--candidate' || arg.startsWith('--candidate=')) options.candidate = readValue();
    else if (arg === '--data-root' || arg.startsWith('--data-root=')) options.dataRoot = path.resolve(readValue());
    else if (arg === '--report-path' || arg.startsWith('--report-path=')) options.reportPath = path.resolve(readValue());
    else if (arg === '--ai=off' || arg === '--no-ai') options.aiMode = 'off';
    else if (arg === '--ai=auto') options.aiMode = 'auto';
    else if (arg === '--coach=off' || arg === '--no-coach') options.coachMode = 'off';
    else if (arg === '--coach=auto') options.coachMode = 'auto';
    else if (arg === '--child-timeout-ms' || arg.startsWith('--child-timeout-ms=')) options.childTimeoutMs = Number(readValue());
    else if (arg === '--rm-data') options.keepData = false;
  }

  return options;
}

function usage() {
  const slugs = candidates.map((candidate) => candidate.slug).join(', ');
  return [
    'Usage:',
    '  npx tsx scripts/qa/proof-harness.ts',
    '  npx tsx scripts/qa/proof-harness.ts --candidate sde-4y',
    '',
    `Candidates: ${slugs}`,
    '',
    'Options:',
    '  --data-root <path>      Parent folder for isolated JOBHUNT_DATA_DIR directories.',
    '  --report-path <path>    Aggregate JSON report path. Defaults to docs/qa/proof-harness-last-run.json.',
    '  --ai=off               Do not exercise external AI providers; deterministic fallbacks still run.',
    '  --ai=auto              Detect configured providers for the report; legacy Gemini proof path runs only when a valid Gemini key exists.',
    '  --coach=off            Skip embedding and coach answer generation.',
    '  --child-timeout-ms N    Timeout for each child candidate run. Defaults to 240000.',
    '  --rm-data              Remove isolated data directories after writing the aggregate report.',
  ].join('\n');
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(filePath: string, data: unknown) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function safeErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error ?? 'Unknown error');
  return raw
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[redacted-api-key]')
    .replace(/sk-[0-9A-Za-z_-]{16,}/g, '[redacted-api-key]')
    .replace(/gsk_[0-9A-Za-z_-]{16,}/g, '[redacted-api-key]')
    .replace(/sk-ant-[0-9A-Za-z_-]{16,}/g, '[redacted-api-key]')
    .replace(/([?&](?:key|api_key)=)[^&\s]+/gi, '$1[redacted]')
    .slice(0, 1_200);
}

function sanitizeOutput(value: string) {
  return value
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[redacted-api-key]')
    .replace(/sk-[0-9A-Za-z_-]{16,}/g, '[redacted-api-key]')
    .replace(/gsk_[0-9A-Za-z_-]{16,}/g, '[redacted-api-key]')
    .replace(/sk-ant-[0-9A-Za-z_-]{16,}/g, '[redacted-api-key]')
    .split(/\r?\n/)
    .slice(-24)
    .join('\n');
}

function loadDotEnvLocal() {
  const envPath = path.join(repoRoot, '.env.local');
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex === -1) continue;
    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();
    if (!key || process.env[key]) continue;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

const PROVIDER_PROOF_CATALOG: Array<{
  provider: ProviderProofName;
  label: string;
  kind: ProviderProofStatus['kind'];
  envKeys: string[];
  baseUrlKeys?: string[];
  modelKeys?: string[];
  settingsKey?: string;
}> = [
  {
    provider: 'openai',
    label: 'OpenAI',
    kind: 'cloud',
    envKeys: ['OPENAI_API_KEY'],
    baseUrlKeys: ['OPENAI_BASE_URL'],
    modelKeys: ['CAREER_SEEK_OPENAI_MODEL', 'OPENAI_MODEL'],
  },
  {
    provider: 'anthropic',
    label: 'Anthropic Claude',
    kind: 'cloud',
    envKeys: ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY'],
    baseUrlKeys: ['ANTHROPIC_BASE_URL'],
    modelKeys: ['CAREER_SEEK_ANTHROPIC_MODEL', 'ANTHROPIC_MODEL'],
  },
  {
    provider: 'gemini',
    label: 'Google Gemini',
    kind: 'cloud',
    envKeys: ['GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'GOOGLE_AI_API_KEY'],
    modelKeys: ['CAREER_SEEK_GEMINI_MODEL', 'GEMINI_MODEL'],
    settingsKey: 'geminiApiKey',
  },
  {
    provider: 'groq',
    label: 'Groq',
    kind: 'compatible',
    envKeys: ['GROQ_API_KEY'],
    baseUrlKeys: ['GROQ_BASE_URL'],
    modelKeys: ['CAREER_SEEK_GROQ_MODEL', 'GROQ_MODEL'],
  },
  {
    provider: 'deepseek',
    label: 'DeepSeek',
    kind: 'compatible',
    envKeys: ['DEEPSEEK_API_KEY'],
    baseUrlKeys: ['DEEPSEEK_BASE_URL'],
    modelKeys: ['CAREER_SEEK_DEEPSEEK_MODEL', 'DEEPSEEK_MODEL'],
  },
  {
    provider: 'openai-compatible',
    label: 'OpenAI-compatible',
    kind: 'compatible',
    envKeys: ['OPENAI_COMPATIBLE_API_KEY'],
    baseUrlKeys: ['OPENAI_COMPATIBLE_BASE_URL'],
    modelKeys: ['CAREER_SEEK_OPENAI_COMPATIBLE_MODEL', 'OPENAI_COMPATIBLE_MODEL'],
  },
  {
    provider: 'ollama',
    label: 'Ollama local',
    kind: 'local',
    envKeys: ['OLLAMA_API_KEY'],
    baseUrlKeys: ['OLLAMA_BASE_URL'],
    modelKeys: ['CAREER_SEEK_OLLAMA_MODEL', 'OLLAMA_MODEL'],
  },
];

function candidateSettingsPaths() {
  return [
    path.join(os.homedir(), '.jobhunt-india', 'config', 'settings.json'),
    path.join(repoRoot, 'data', 'config', 'settings.json'),
    path.join(repoRoot, '.jobhunt-india', 'config', 'settings.json'),
  ];
}

function readSettingsJson(settingsPath: string): Record<string, any> | null {
  try {
    if (!fs.existsSync(settingsPath)) return null;
    return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch {
    return null;
  }
}

function readFirstConfiguredEnv(keys: string[]) {
  for (const key of keys) {
    if (process.env[key]?.trim()) return `env:${key}`;
  }
  return '';
}

function readProviderSourceFromSettings(settingsPath: string, provider: ProviderProofName) {
  const parsed = readSettingsJson(settingsPath);
  if (!parsed) return '';
  const providerSettings = parsed.aiProviders?.[provider];

  if (provider === 'gemini' && typeof parsed.geminiApiKey === 'string' && parsed.geminiApiKey.trim()) {
    return `settings:${path.relative(repoRoot, settingsPath) || settingsPath}:geminiApiKey`;
  }

  if (providerSettings?.apiKey || providerSettings?.baseUrl || providerSettings?.model || providerSettings?.enabled) {
    return `settings:${path.relative(repoRoot, settingsPath) || settingsPath}:aiProviders.${provider}`;
  }

  if (parsed.aiProvider === provider || parsed.selectedProvider === provider) {
    return `settings:${path.relative(repoRoot, settingsPath) || settingsPath}:selected`;
  }

  return '';
}

function readGeminiKeyFromSettings(settingsPath: string) {
  try {
    if (!fs.existsSync(settingsPath)) return '';
    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    return typeof parsed.geminiApiKey === 'string' ? parsed.geminiApiKey.trim() : '';
  } catch {
    return '';
  }
}

function discoverGeminiKey(aiMode: AiMode): { key: string; source: string } {
  if (aiMode === 'off') return { key: '', source: 'disabled' };
  loadDotEnvLocal();

  const envKey = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  if (envKey) {
    return {
      key: envKey,
      source: process.env.GEMINI_API_KEY?.trim() ? 'env:GEMINI_API_KEY' : 'env:GOOGLE_GENERATIVE_AI_API_KEY',
    };
  }

  for (const settingsPath of candidateSettingsPaths()) {
    const key = readGeminiKeyFromSettings(settingsPath);
    if (key) return { key, source: `settings:${path.relative(repoRoot, settingsPath) || settingsPath}` };
  }

  return { key: '', source: 'missing' };
}

function buildProviderProof(options: { aiMode: AiMode; gemini: { key: string; source: string } }) {
  loadDotEnvLocal();
  const configuredRows = PROVIDER_PROOF_CATALOG.map((entry): ProviderProofStatus => {
    const envProbeKeys =
      entry.kind === 'cloud'
        ? entry.envKeys
        : [...(entry.envKeys || []), ...(entry.baseUrlKeys || []), ...(entry.modelKeys || [])];
    const envSource = readFirstConfiguredEnv(envProbeKeys);
    const settingsSource = candidateSettingsPaths()
      .map((settingsPath) => readProviderSourceFromSettings(settingsPath, entry.provider))
      .find(Boolean) || '';
    const source = entry.provider === 'gemini' && options.gemini.key ? options.gemini.source : envSource || settingsSource || 'not_configured';
    const configured = options.aiMode !== 'off' && source !== 'not_configured' && source !== 'disabled';
    const proofSupport =
      entry.provider === 'gemini' && options.gemini.key
        ? 'exercised'
        : entry.provider === 'ollama' && configured
          ? 'metadata_only'
          : 'metadata_only';

    return {
      provider: entry.provider,
      label: entry.label,
      kind: entry.kind,
      configured,
      source: options.aiMode === 'off' ? 'disabled_by_qa_flag' : source,
      proofSupport,
      note:
        entry.provider === 'gemini' && options.gemini.key
          ? 'Legacy Gemini-backed proof path may be exercised when validation succeeds.'
          : entry.provider === 'ollama'
            ? 'Detected as a local-provider candidate; this QA harness does not require Ollama to be running.'
            : 'Detected for provider-matrix visibility only; no external key is required for this proof.',
    };
  });

  const ollamaConfigured = configuredRows.some((row) => row.provider === 'ollama' && row.configured);
  const cloudConfigured = configuredRows.some((row) => row.kind !== 'local' && row.configured);
  const activeProvider: ProviderProofName =
    options.aiMode === 'off'
      ? 'deterministic'
      : options.gemini.key
        ? 'gemini'
        : ollamaConfigured
          ? 'ollama'
          : 'deterministic';

  const deterministic: ProviderProofStatus = {
    provider: 'deterministic',
    label: 'Deterministic local fallback',
    kind: 'fallback',
    configured: true,
    source: 'built_in',
    proofSupport: 'fallback',
    note: 'Always available. Used when no exercised provider is valid or when --ai=off is supplied.',
  };

  return {
    activeProvider,
    mode: options.aiMode,
    cloudConfigured,
    ollamaConfigured,
    noKeyPathAvailable: true,
    providers: [...configuredRows, deterministic],
  };
}

function runLocalCommand(command: string, args: string[], env: NodeJS.ProcessEnv) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });

  const printable = [command, ...args].join(' ');
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${printable}\n${sanitizeOutput(result.stdout || '')}\n${sanitizeOutput(result.stderr || '')}`);
  }

  return {
    command: printable,
    stdoutTail: sanitizeOutput(result.stdout || ''),
    stderrTail: sanitizeOutput(result.stderr || ''),
  };
}

function resumeParagraphs(candidate: CandidateFixture) {
  const profile = candidate.profile;
  const prefs = candidate.preferences;
  return [
    `${profile.fullName}`,
    `${profile.headline}`,
    `Email: ${candidate.email} | Phone: ${candidate.phone} | Location: ${candidate.location}`,
    `Target: ${prefs.title} | Experience: ${profile.yearsOfExperience} years | Work model: ${prefs.workModel}`,
    `Professional Summary: ${profile.rawSummary}`,
    `Explicit Skills: ${profile.skills.explicit.join(', ')}`,
    `Inferred Strengths: ${profile.skills.inferred.join(', ')}`,
    `Tools: ${profile.tools.join(', ')}`,
    `Domains: ${profile.domains.join(', ')}`,
    ...profile.experience.flatMap((item) => [
      `Experience: ${item.role}, ${item.company}, ${item.duration}`,
      item.summary,
    ]),
    ...profile.projects.flatMap((item) => [
      `Project: ${item.name}`,
      `${item.description} Technologies: ${item.technologies.join(', ')}`,
    ]),
    `Achievements: ${profile.achievements.join(' | ')}`,
    `Education: ${profile.education.map((item) => `${item.degree}, ${item.institution}, ${item.year}`).join(' | ')}`,
    `Certifications: ${profile.certifications.join(', ')}`,
    `Search Preferences: locations ${prefs.locations.join(', ')}; salary ${prefs.expectedSalary}; company types ${prefs.companyTypes.join(', ')}; must have ${prefs.mustHaveKeywords.join(', ')}; avoid ${prefs.avoidKeywords.join(', ')}.`,
    `Clarifications: Notice period is ${prefs.noticePeriod}. Relocation willingness is ${prefs.relocationWillingness ? 'yes' : 'no'}.`,
  ];
}

async function createResumeDocx(candidate: CandidateFixture, filePath: string) {
  ensureDir(path.dirname(filePath));
  const children = resumeParagraphs(candidate).map((text, index) => {
    if (index === 0) {
      return new Paragraph({
        children: [new TextRun({ text, bold: true, size: 32 })],
      });
    }
    return new Paragraph(text);
  });
  const doc = new Document({ sections: [{ children }] });
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(filePath, buffer);
}

function profileForDb(profile: CandidateProfile, profileId: number) {
  return {
    profileId,
    fullName: profile.fullName,
    headline: profile.headline,
    yearsOfExperience: profile.yearsOfExperience,
    targetSeniority: profile.targetSeniority,
    skillsExplicit: JSON.stringify(profile.skills.explicit),
    skillsInferred: JSON.stringify(profile.skills.inferred),
    tools: JSON.stringify(profile.tools),
    domains: JSON.stringify(profile.domains),
    experience: JSON.stringify(profile.experience),
    projects: JSON.stringify(profile.projects),
    achievements: JSON.stringify(profile.achievements),
    education: JSON.stringify(profile.education),
    certifications: JSON.stringify(profile.certifications),
    strengths: JSON.stringify(profile.strengths),
    gaps: JSON.stringify(profile.gaps),
    rawSummary: profile.rawSummary,
    updatedAt: new Date(),
  };
}

function extractionProfileForDb(extracted: any, fallback: CandidateProfile, profileId: number) {
  const profile = extracted || fallback;
  return profileForDb({
    ...fallback,
    ...profile,
    skills: {
      explicit: Array.isArray(profile.skills?.explicit) ? profile.skills.explicit : fallback.skills.explicit,
      inferred: Array.isArray(profile.skills?.inferred) ? profile.skills.inferred : fallback.skills.inferred,
    },
    tools: Array.isArray(profile.tools) ? profile.tools : fallback.tools,
    domains: Array.isArray(profile.domains) ? profile.domains : fallback.domains,
    experience: Array.isArray(profile.experience) ? profile.experience : fallback.experience,
    projects: Array.isArray(profile.projects) ? profile.projects : fallback.projects,
    achievements: Array.isArray(profile.achievements) ? profile.achievements : fallback.achievements,
    education: Array.isArray(profile.education) ? profile.education : fallback.education,
    certifications: Array.isArray(profile.certifications) ? profile.certifications : fallback.certifications,
    strengths: Array.isArray(profile.strengths) ? profile.strengths : fallback.strengths,
    gaps: Array.isArray(profile.gaps) ? profile.gaps : fallback.gaps,
    rawSummary: profile.rawSummary || fallback.rawSummary,
    metadata: profile.metadata || fallback.metadata,
  }, profileId);
}

function summarizeActionResult(value: any) {
  if (!value || typeof value !== 'object') return value;
  return {
    success: Boolean(value.success),
    id: value.id,
    resumeId: value.resumeId,
    pdfResumeId: value.pdfResumeId,
    filePath: value.filePath,
    pdfPath: value.pdfPath,
    atsScore: value.atsReport?.atsScore,
    status: value.status,
    saved: value.saved,
    applied: value.applied,
    contentLength: typeof value.content === 'string' ? value.content.length : undefined,
    briefSummaryLength: typeof value.brief?.fitSummary === 'string' ? value.brief.fitSummary.length : undefined,
    error: value.error ? safeErrorMessage(value.error) : undefined,
    message: value.message,
  };
}

function countBy<T extends Record<string, any>>(rows: T[], key: keyof T) {
  return rows.reduce((acc, row) => {
    const value = String(row[key] ?? 'unknown');
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

function scrubProviderKeys(settingsPath: string) {
  try {
    if (!fs.existsSync(settingsPath)) return;
    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    if ('geminiApiKey' in parsed) {
      delete parsed.geminiApiKey;
    }
    if (parsed.aiProviders && typeof parsed.aiProviders === 'object') {
      for (const settings of Object.values(parsed.aiProviders as Record<string, any>)) {
        if (settings && typeof settings === 'object') delete settings.apiKey;
      }
    }
    fs.writeFileSync(settingsPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
  } catch {
    // Best-effort cleanup only.
  }
}

async function runCandidate(options: CliOptions) {
  const candidate = candidates.find((item) => item.slug === options.candidate);
  if (!candidate) {
    throw new Error(`Unknown candidate "${options.candidate}". Use one of: ${candidates.map((item) => item.slug).join(', ')}`);
  }

  const dataDir = path.join(options.dataRoot, candidate.slug);
  const settingsPath = path.join(dataDir, 'config', 'settings.json');
  const startedAt = new Date().toISOString();
  const commands: Array<{ command: string; stdoutTail?: string; stderrTail?: string }> = [];
  const warnings: string[] = [];
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    JOBHUNT_DATA_DIR: dataDir,
    JOBHUNT_ENABLE_VALIDATION_SOURCE: '1',
  };

  fs.rmSync(dataDir, { recursive: true, force: true });
  ensureDir(dataDir);

  const gemini = discoverGeminiKey(options.aiMode);
  const aiProviderProof = buildProviderProof({ aiMode: options.aiMode, gemini });
  if (gemini.key) env.GEMINI_API_KEY = gemini.key;

  try {
    commands.push(runLocalCommand(process.execPath, ['scripts/db-init.mjs'], env));
    commands.push(runLocalCommand(process.execPath, ['scripts/db-schema-push.mjs'], env));
    commands.push(runLocalCommand(process.execPath, ['scripts/k1-bootstrap-migration.mjs'], env));

    process.env.JOBHUNT_DATA_DIR = dataDir;
    process.env.JOBHUNT_ENABLE_VALIDATION_SOURCE = '1';
    if (gemini.key) process.env.GEMINI_API_KEY = gemini.key;

    const dbModule = await import('../../src/db');
    const schema = await import('../../src/db/schema');
    const drizzle = await import('drizzle-orm');
    const configModule = await import('../../src/lib/config');
    const localPaths = await import('../../src/lib/local-paths');
    const identity = await import('../../src/lib/platform/identity');
    const resumeParser = await import('../../src/lib/services/resume-parser');
    const geminiService = await import('../../src/lib/services/gemini');
    const scraping = await import('../../src/lib/services/scraping/orchestrator');
    const scoring = await import('../../src/lib/services/scoring/engine');
    const dashboard = await import('../../src/lib/services/dashboard/command-center');
    const discoverActions = await import('../../src/app/discover/actions');
    const documentActions = await import('../../src/app/discover/document-actions');
    const coachChunker = await import('../../src/lib/services/coach/chunker');
    const coachActions = await import('../../src/app/coach/coach-actions');

    const db = dbModule.getDb();
    const { eq, and, desc } = drizzle;
    const { userId, profileId } = identity.resolveContext();
    const fixturesDir = path.join(localPaths.getAppSubDir('uploads'), 'qa-fixtures');
    const resumePath = path.join(fixturesDir, `${candidate.slug}-resume.docx`);

    await createResumeDocx(candidate, resumePath);
    const parsedResume = await resumeParser.parseResumeFileWithMetadata(resumePath, DOCX_MIME);
    const resumeUpload = db.insert(schema.uploadedResumes).values({
      profileId,
      filename: path.basename(resumePath),
      originalPath: resumePath,
      mimeType: DOCX_MIME,
      parsedText: parsedResume.text,
      parseMetadata: JSON.stringify({
        parser: parsedResume.metadata,
        candidate: candidate.slug,
      }),
      uploadedAt: new Date(),
    }).returning({ id: schema.uploadedResumes.id }).get();

    let extractedProfile: any = null;
    let extractionAnalysis: any = null;
    let geminiValidation: any = {
      attempted: Boolean(gemini.key),
      source: gemini.source,
      success: false,
      category: gemini.key ? 'not_run' : 'missing',
    };

    if (gemini.key) {
      const validation = await geminiService.validateApiKeyDetailed(gemini.key);
      geminiValidation = {
        attempted: true,
        source: gemini.source,
        success: validation.success,
        category: validation.category,
        message: validation.message,
      };

      if (validation.success) {
        try {
          const extracted = await geminiService.extractProfileWithAnalysis(parsedResume.text, gemini.key);
          extractedProfile = extracted.profile;
          extractionAnalysis = extracted.analysis;
        } catch (error) {
          warnings.push(`Configured Gemini provider extraction fell back to curated profile: ${safeErrorMessage(error)}`);
        }
      }
    }

    const profileSource = extractedProfile ? 'provider_extract_profile:gemini' : 'curated_fixture';
    const masterProfile = db.insert(schema.masterProfiles).values(
      extractionProfileForDb(extractedProfile, candidate.profile, profileId),
    ).returning({ id: schema.masterProfiles.id }).get();

    const searchProfile = db.insert(schema.searchProfiles).values({
      profileId,
      title: candidate.preferences.title,
      locations: JSON.stringify(candidate.preferences.locations),
      workModel: candidate.preferences.workModel,
      expectedSalary: candidate.preferences.expectedSalary,
      experienceBand: candidate.preferences.experienceBand,
      companyTypes: JSON.stringify(candidate.preferences.companyTypes),
      preferredPortals: JSON.stringify(['validation_seed', 'validation_fail']),
      mustHaveKeywords: JSON.stringify(candidate.preferences.mustHaveKeywords),
      avoidKeywords: JSON.stringify(candidate.preferences.avoidKeywords),
      noticePeriod: candidate.preferences.noticePeriod,
      relocationWillingness: candidate.preferences.relocationWillingness,
      isActive: true,
    }).returning({ id: schema.searchProfiles.id }).get();

    configModule.saveAppConfig({
      geminiApiKey: gemini.key || undefined,
      aiProvider: gemini.key ? 'gemini' : aiProviderProof.activeProvider === 'ollama' ? 'ollama' : undefined,
      aiProviders: gemini.key
        ? { gemini: { apiKey: gemini.key, enabled: true } }
        : aiProviderProof.activeProvider === 'ollama'
          ? { ollama: { enabled: true } }
          : undefined,
      isConfigured: true,
      onboardingVersion: configModule.ONBOARDING_FLOW_VERSION,
      onboardingStage: 'dashboard',
      onboardingStep: 7,
      resumeUploadId: resumeUpload.id,
      masterProfileId: masterProfile.id,
      searchProfileId: searchProfile.id,
      lastInitialScanAt: new Date().toISOString(),
      dashboardUnlockedAt: new Date().toISOString(),
    });

    let validationScan: any = null;
    try {
      validationScan = await new scraping.ScanOrchestrator().runScan(
        searchProfile.id,
        ['validation_seed', 'validation_fail'],
      );
    } catch (error) {
      validationScan = { status: 'failed', error: safeErrorMessage(error) };
      warnings.push(`Validation scan failed: ${safeErrorMessage(error)}`);
    }

    const qaScan = db.insert(schema.scans).values({
      profileId,
      searchProfileId: searchProfile.id,
      status: 'complete',
      startedAt: new Date(),
      finishedAt: new Date(),
      totalJobs: 1,
    }).returning({ id: schema.scans.id }).get();

    db.insert(schema.scanPortalRuns).values({
      scanId: qaScan.id,
      portal: QA_PORTAL,
      status: 'complete',
      jobsFound: 1,
      startedAt: new Date(),
      finishedAt: new Date(),
    }).run();

    const qaJob = db.insert(schema.normalizedJobs).values({
      profileId,
      scanId: qaScan.id,
      searchProfileId: searchProfile.id,
      portal: QA_PORTAL,
      externalId: `${candidate.slug}-qa-seed-001`,
      title: candidate.qaJob.title,
      company: candidate.qaJob.company,
      location: candidate.qaJob.location,
      isRemote: Boolean(candidate.qaJob.isRemote),
      isHybrid: Boolean(candidate.qaJob.isHybrid),
      salaryRaw: candidate.qaJob.salaryRaw,
      experienceRaw: candidate.qaJob.experienceRaw,
      salaryCurrency: 'INR',
      experienceMin: candidate.qaJob.experienceMin,
      experienceMax: candidate.qaJob.experienceMax,
      url: candidate.qaJob.url,
      applyUrl: candidate.qaJob.url,
      snippet: candidate.qaJob.snippet,
      employmentType: candidate.qaJob.employmentType,
      scrapedAt: new Date(),
    }).returning({ id: schema.normalizedJobs.id }).get();

    const scoredCount = await scoring.scoreUnscoredJobs(profileId);
    const selectedJob = db.select({
      scoredJob: schema.scoredJobs,
      normalizedJob: schema.normalizedJobs,
    })
      .from(schema.scoredJobs)
      .innerJoin(schema.normalizedJobs, eq(schema.scoredJobs.normalizedJobId, schema.normalizedJobs.id))
      .where(and(eq(schema.scoredJobs.profileId, profileId), eq(schema.normalizedJobs.id, qaJob.id)))
      .orderBy(desc(schema.scoredJobs.score))
      .get();

    if (!selectedJob) {
      throw new Error(`No scored QA job was created for ${candidate.slug}`);
    }

    const brief = await discoverActions.generateBriefForJob(selectedJob.scoredJob.id);
    const saved = await documentActions.toggleSavedStatus(selectedJob.scoredJob.id);
    const applied = await documentActions.toggleAppliedStatus(selectedJob.scoredJob.id);
    const resume = await documentActions.generateResumePipeline(selectedJob.scoredJob.id);
    const coverLetter = await documentActions.generateCoverLetterAction(selectedJob.scoredJob.id);
    const outreach = await documentActions.generateOutreachNoteAction(selectedJob.scoredJob.id);
    const documentAssets = db.select()
      .from(schema.documentAssets)
      .where(and(eq(schema.documentAssets.profileId, profileId), eq(schema.documentAssets.scoredJobId, selectedJob.scoredJob.id)))
      .all();
    const applications = db.select()
      .from(schema.applications)
      .where(eq(schema.applications.profileId, profileId))
      .all();

    const rawChunks = coachChunker.generateChunks({
      includeProfile: true,
      scoredJobId: selectedJob.scoredJob.id,
    });
    const coach: any = {
      generatedChunkCount: rawChunks.length,
      suggestions: await coachActions.getCoachSuggestions(selectedJob.scoredJob.id),
    };

    if (options.coachMode === 'auto' && geminiValidation.success) {
      try {
        coach.index = await coachActions.indexForCoach({
          scoredJobId: selectedJob.scoredJob.id,
          forceReindex: true,
        });
        const thread = await coachActions.createCoachThread({
          scoredJobId: selectedJob.scoredJob.id,
          scope: 'job_and_profile',
        });
        coach.threadId = thread.thread.id;
        const answer = await coachActions.askCoach({
          threadId: thread.thread.id,
          question: `How should ${candidate.profile.fullName.split(' ')[0]} position their experience for this role?`,
          scope: 'job_and_profile',
          answerMode: 'concise',
        });
        coach.answer = {
          success: answer.success,
          confidenceLevel: answer.message.confidenceLevel,
          sourcesUsed: answer.meta.sourcesUsed,
          answerLength: answer.message.content.length,
        };
      } catch (error) {
        coach.answer = { success: false, error: safeErrorMessage(error) };
        warnings.push(`Coach flow failed or was skipped after index attempt: ${safeErrorMessage(error)}`);
      }
    } else {
      coach.answer = {
        success: false,
        skipped: options.coachMode === 'off' ? 'disabled_by_flag' : 'configured_provider_not_exercised_by_legacy_coach_path',
      };
    }

    const commandCenter = await dashboard.getCommandCenterData();
    const portalRuns = db.select().from(schema.scanPortalRuns).all();
    const scoredJobs = db.select()
      .from(schema.scoredJobs)
      .where(eq(schema.scoredJobs.profileId, profileId))
      .all();
    const normalizedJobs = db.select()
      .from(schema.normalizedJobs)
      .where(eq(schema.normalizedJobs.profileId, profileId))
      .all();
    const jdAnalyses = db.select().from(schema.jdAnalyses).all();
    const aiLogs = db.select().from(schema.aiRequestLogs).all();

    const report = {
      success: true,
      candidate: {
        slug: candidate.slug,
        label: candidate.label,
        name: candidate.profile.fullName,
        target: candidate.preferences.title,
      },
      dataDir,
      startedAt,
      finishedAt: new Date().toISOString(),
      userId,
      profileId,
      warnings,
      aiProviderProof,
      gemini: {
        attempted: geminiValidation.attempted,
        source: gemini.source,
        success: geminiValidation.success,
        category: geminiValidation.category,
        message: geminiValidation.message,
        legacyField: true,
      },
      resumeParsing: {
        uploadId: resumeUpload.id,
        path: resumePath,
        characterCount: parsedResume.metadata.characterCount,
        wordCount: parsedResume.metadata.wordCount,
        confidence: parsedResume.metadata.confidence,
        issues: parsedResume.metadata.issues,
        warnings: parsedResume.metadata.warnings,
      },
      profileExtraction: {
        source: profileSource,
        masterProfileId: masterProfile.id,
        analysis: extractionAnalysis ? {
          confidence: extractionAnalysis.confidence,
          needsClarification: extractionAnalysis.needsClarification,
          clarificationQuestionCount: extractionAnalysis.clarificationQuestions?.length || 0,
        } : null,
      },
      searchProfile: {
        id: searchProfile.id,
        title: candidate.preferences.title,
        locations: candidate.preferences.locations,
        workModel: candidate.preferences.workModel,
      },
      scans: {
        validation: validationScan,
        qaSeedScanId: qaScan.id,
        portalRuns: portalRuns.map((run) => ({
          portal: run.portal,
          status: run.status,
          jobsFound: run.jobsFound,
          error: run.error,
        })),
      },
      scoring: {
        scoredCount,
        selectedScoredJobId: selectedJob.scoredJob.id,
        selectedNormalizedJobId: selectedJob.normalizedJob.id,
        selectedScore: selectedJob.scoredJob.score,
        selectedTier: selectedJob.scoredJob.tier,
      },
      jobActions: {
        brief: summarizeActionResult(brief),
        saved: summarizeActionResult(saved),
        applied: summarizeActionResult(applied),
      },
      documents: {
        resume: summarizeActionResult(resume),
        coverLetter: summarizeActionResult(coverLetter),
        outreach: summarizeActionResult(outreach),
        assetCount: documentAssets.length,
        assetTypes: countBy(documentAssets, 'type'),
      },
      appState: {
        applications: applications.map((app) => ({
          id: app.id,
          scoredJobId: app.scoredJobId,
          status: app.status,
          title: app.title,
          company: app.company,
        })),
        commandCenter: {
          stats: commandCenter.stats,
          priorityQueueLength: commandCenter.priorityQueue.length,
          latestJobsLength: commandCenter.latestJobs.length,
          portalHealth: commandCenter.systemStatus.portalHealth,
          documentsGenerated: commandCenter.insights.documentsGenerated,
        },
      },
      coach,
      counts: {
        normalizedJobs: normalizedJobs.length,
        scoredJobs: scoredJobs.length,
        applications: applications.length,
        documentAssets: documentAssets.length,
        jdAnalyses: jdAnalyses.length,
        aiRequestLogs: aiLogs.length,
      },
      commands,
    };

    const reportPath = path.join(localPaths.getAppSubDir('logs'), 'qa-proof-report.json');
    writeJson(reportPath, report);
    scrubProviderKeys(settingsPath);

    return {
      ...report,
      reportPath,
    };
  } catch (error) {
    scrubProviderKeys(settingsPath);
    const failed = {
      success: false,
      candidate: {
        slug: candidate.slug,
        label: candidate.label,
        name: candidate.profile.fullName,
        target: candidate.preferences.title,
      },
      dataDir,
      startedAt,
      finishedAt: new Date().toISOString(),
      warnings,
      aiProviderProof,
      error: safeErrorMessage(error),
      commands,
    };
    writeJson(path.join(dataDir, 'logs', 'qa-proof-report.json'), failed);
    return failed;
  }
}

function parseChildResult(stdout: string) {
  const line = stdout.split(/\r?\n/).find((item) => item.startsWith(RESULT_PREFIX));
  if (!line) return null;
  try {
    return JSON.parse(line.slice(RESULT_PREFIX.length));
  } catch {
    return null;
  }
}

function runAll(options: CliOptions) {
  const scriptPath = path.resolve(process.argv[1]);
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const results: any[] = [];

  ensureDir(options.dataRoot);
  const writeAggregate = () => {
    const aggregate = {
      success: results.length === candidates.length && results.every((result) => result.success),
      startedAt: results[0]?.startedAt || new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      dataRoot: options.dataRoot,
      reportPath: options.reportPath,
      aiMode: options.aiMode,
      coachMode: options.coachMode,
      childTimeoutMs: options.childTimeoutMs,
      providerMatrix: {
        noKeyRuns: results.filter((result) => result.aiProviderProof?.activeProvider === 'deterministic').length,
        ollamaDetectedRuns: results.filter((result) => result.aiProviderProof?.ollamaConfigured).length,
        configuredProviderRuns: results.filter((result) => result.aiProviderProof?.cloudConfigured).length,
        activeProviders: countBy(
          results
            .map((result) => ({ provider: result.aiProviderProof?.activeProvider || 'unknown' }))
            .filter(Boolean),
          'provider',
        ),
      },
      candidateCount: candidates.length,
      completed: results.length,
      passed: results.filter((result) => result.success).length,
      failed: results.filter((result) => !result.success).length,
      results,
    };
    writeJson(options.reportPath, aggregate);
    return aggregate;
  };

  for (const candidate of candidates) {
    const args = [
      'tsx',
      scriptPath,
      '--candidate',
      candidate.slug,
      '--data-root',
      options.dataRoot,
      '--report-path',
      options.reportPath,
      `--ai=${options.aiMode}`,
      `--coach=${options.coachMode}`,
    ];
    const result = spawnSync(npx, args, {
      cwd: repoRoot,
      env: process.env,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      timeout: Number.isFinite(options.childTimeoutMs) ? options.childTimeoutMs : 240_000,
    });

    const parsed = parseChildResult(result.stdout || '');
    if (parsed) {
      results.push(parsed);
    } else {
      results.push({
        success: false,
        candidate: { slug: candidate.slug, label: candidate.label },
        error: result.error?.message || `Child process did not emit ${RESULT_PREFIX.trim()}.`,
        status: result.status,
        signal: result.signal,
        stdoutTail: sanitizeOutput(result.stdout || ''),
        stderrTail: sanitizeOutput(result.stderr || ''),
      });
    }

    const latest = results[results.length - 1];
    const status = latest.success ? 'PASS' : 'FAIL';
    const score = latest.scoring?.selectedScore ?? 'n/a';
    const docs = latest.documents?.assetCount ?? 0;
    console.log(`[${status}] ${candidate.slug}: score=${score}, docs=${docs}, dataDir=${latest.dataDir || 'n/a'}`);
    writeAggregate();
  }

  const aggregate = writeAggregate();
  if (!options.keepData) fs.rmSync(options.dataRoot, { recursive: true, force: true });

  console.log(`Aggregate report: ${options.reportPath}`);
  if (!aggregate.success) process.exitCode = 1;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  if (!options.candidate || options.candidate === 'all') {
    runAll(options);
    return;
  }

  const result = await runCandidate(options);
  console.log(`${RESULT_PREFIX}${JSON.stringify(result)}`);
  if (!result.success) process.exitCode = 1;
}

main().catch((error) => {
  console.error(safeErrorMessage(error));
  process.exit(1);
});
