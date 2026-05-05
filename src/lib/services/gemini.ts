import { MasterProfile, ProfileSchema } from '../schemas/profile';
import { logAiRequest } from './monitoring/ai-logger';
import { getAIManager } from '../ai/manager';
import { getAIRuntimeEnv, getAppConfig } from '../config';

export type GeminiValidationCategory =
  | 'valid'
  | 'missing'
  | 'invalid'
  | 'timeout'
  | 'quota'
  | 'connectivity'
  | 'unknown';

export interface GeminiValidationResult {
  success: boolean;
  category: GeminiValidationCategory;
  message: string;
  action: string;
}

export interface ClarificationQuestion {
  id: string;
  question: string;
  reason: string;
  field?: string;
  type?: 'short_text' | 'long_text' | 'choice';
  options?: string[];
}

export interface ResumeAnalysisResult {
  confidence: number;
  confidenceNotes: string;
  extractionIssues: string[];
  clarificationQuestions: ClarificationQuestion[];
  needsClarification: boolean;
}

export interface ExtractProfileResult {
  profile: MasterProfile;
  analysis: ResumeAnalysisResult;
}

export interface ClarificationRefinementInput {
  resumeText: string;
  currentProfile: MasterProfile;
  answers: Record<string, string>;
  questions?: ClarificationQuestion[];
  apiKey?: string;
}

function isGeminiSimulationEnabled() {
  return process.env.JOBHUNT_SIMULATE_GEMINI === 'valid' && process.env.JOBHUNT_ENABLE_VALIDATION_SOURCE === '1';
}

export function safeAiErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error ?? 'Unknown AI error');
  if (
    /(ZodError|invalid_type|invalid_union|required)/i.test(raw) &&
    /("path"|"expected"|"received"|validation)/i.test(raw)
  ) {
    return 'The AI response did not match the expected profile format, so Career Seek used a conservative fallback.';
  }
  return raw
    .replace(/\s+/g, ' ')
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[redacted-api-key]')
    .replace(/([?&](?:key|api_key)=)[^&\s]+/gi, '$1[redacted]')
    .slice(0, 300);
}

function simulatedProfile(): ExtractProfileResult {
  return {
    profile: {
      fullName: 'Asha Mehta',
      headline: 'AI Product Manager focused on fintech, SaaS, LLM products, and analytics',
      yearsOfExperience: 6,
      targetSeniority: 'Senior',
      skills: {
        explicit: [
          'AI product management',
          'LLMs',
          'RAG',
          'SQL',
          'Product strategy',
          'Analytics',
          'PRDs',
          'Stakeholder management',
        ],
        inferred: [
          'Roadmap ownership',
          'Customer discovery',
          'Experimentation',
          'GTM collaboration',
        ],
      },
      tools: ['Gemini', 'SQL', 'Amplitude', 'Figma', 'Jira'],
      domains: ['Fintech', 'SaaS', 'AI-native products'],
      experience: [
        {
          role: 'Senior Product Manager',
          company: 'Fintech Cloud India',
          duration: 'Jan 2022 - Present',
          summary: 'Built AI onboarding workflows, partnered with engineering and GTM, and used analytics to improve activation.',
        },
        {
          role: 'Product Manager',
          company: 'SaaSWorks',
          duration: 'Jun 2019 - Dec 2021',
          summary: 'Owned roadmap, PRDs, discovery, and experimentation for B2B SaaS workflows.',
        },
      ],
      projects: [
        {
          name: 'AI onboarding assistant',
          description: 'LLM and RAG workflow for user onboarding and activation.',
          technologies: ['LLM', 'RAG', 'Analytics'],
        },
      ],
      achievements: [
        'Reduced onboarding friction by redesigning AI-assisted activation journeys.',
        'Partnered with engineering, design, and GTM teams to launch fintech product workflows.',
      ],
      education: [
        {
          degree: 'B.Tech Computer Science',
          institution: 'PES University',
          year: '2018',
        },
      ],
      certifications: ['Product Analytics', 'Advanced SQL'],
      strengths: ['AI product strategy', 'Fintech domain context', 'Analytics-led prioritization'],
      gaps: ['Latest relocation preference and expected salary need confirmation.'],
      rawSummary: 'Senior AI Product Manager based in Bengaluru with fintech, SaaS, LLM, RAG, SQL, analytics, roadmap, PRD, and stakeholder management experience.',
      metadata: {
        confidenceNotes: 'Validation-mode Gemini profile extracted from the uploaded resume fixture.',
      },
    },
    analysis: {
      confidence: 64,
      confidenceNotes: 'Gemini is confident in the core product/AI profile but needs a little clarification on current status and search constraints.',
      extractionIssues: [
        'Current employment status and notice period are not explicit.',
        'Salary expectation and exact preferred locations are not present in the resume.',
      ],
      needsClarification: true,
      clarificationQuestions: [
        {
          id: 'current_status_notice_period',
          question: 'What is your current employment status and notice period?',
          reason: 'This affects realistic application prioritization and recruiter outreach.',
          field: 'availability',
          type: 'short_text',
        },
        {
          id: 'salary_location_preference',
          question: 'What salary range and India locations should the scanner prioritize?',
          reason: 'The resume does not state target compensation or preferred cities.',
          field: 'search_preferences',
          type: 'short_text',
        },
      ],
    },
  };
}

function simulatedGeminiResponse(taskType: string, prompt: string): string | null {
  if (!isGeminiSimulationEnabled()) return null;

  const extraction = simulatedProfile();
  const task = taskType || 'custom';

  // Validation simulation is useful for onboarding/key checks, but document assets
  // must always be generated from the selected job and current local profile.
  if (['jd_analysis', 'tailor_resume', 'cover_letter', 'outreach', 'ats_check'].includes(task)) {
    return null;
  }

  if (task === 'extract_profile') {
    return JSON.stringify(extraction);
  }

  if (task === 'refine_profile') {
    return JSON.stringify({
      ...extraction.profile,
      rawSummary: `${extraction.profile.rawSummary} Clarification answers were incorporated before matching.`,
      metadata: {
        confidenceNotes: 'Validation-mode Gemini refinement applied clarification answers.',
      },
    });
  }

  if (task === 'job_brief' || task === 'custom') {
    return JSON.stringify({
      fitSummary: 'This is a strong fit because the role asks for AI product ownership, analytics, and cross-functional execution in an India-focused context.',
      pros: [
        'Strong overlap with AI, LLM/RAG, roadmap, and analytics responsibilities.',
        'Fintech and SaaS background maps cleanly to the job domain.',
        'The resume has enough product execution evidence to tailor application assets.',
      ],
      cons: [
        'Confirm compensation range before applying.',
        'If the role is highly technical, add more implementation-specific AI examples.',
      ],
      interviewAngle: 'Lead with AI onboarding, analytics-driven activation, and stakeholder alignment across engineering and GTM.',
      salaryEstimate: 'The listed India salary band appears reasonable for senior AI product roles if the responsibilities match.',
      resumeFocus: 'Move AI product, LLM/RAG, SQL, analytics, and roadmap achievements to the top third of the resume.',
    });
  }

  return JSON.stringify({ content: prompt.slice(0, 200) });
}

function stripJsonFences(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function extractJsonCandidate(text: string) {
  const payload = stripJsonFences(text);
  const objectStart = payload.indexOf('{');
  const objectEnd = payload.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) {
    return payload.slice(objectStart, objectEnd + 1);
  }
  const arrayStart = payload.indexOf('[');
  const arrayEnd = payload.lastIndexOf(']');
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    return payload.slice(arrayStart, arrayEnd + 1);
  }
  return payload;
}

/**
 * Parses JSON from Gemini output while tolerating common response wrappers.
 * It intentionally stays conservative: if the payload is structurally broken,
 * callers should use task-specific fallback logic instead of guessing.
 */
export function parseGeminiJson<T = any>(text: string): T {
  const candidate = extractJsonCandidate(text);
  const attempts = [
    candidate,
    candidate.replace(/,\s*([}\]])/g, '$1'),
    candidate.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/,\s*([}\]])/g, '$1'),
  ];

  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt) as T;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

const SECTION_ALIASES: Array<{ key: string; patterns: RegExp[] }> = [
  { key: 'target', patterns: [/^target$/i, /^objective$/i, /^professional summary$/i, /^summary$/i, /^profile$/i] },
  { key: 'experience', patterns: [/^experience$/i, /^professional experience$/i, /^work experience$/i, /^employment history$/i] },
  { key: 'projects', patterns: [/^projects$/i, /^major projects$/i, /^key projects$/i, /^open source and side projects$/i] },
  { key: 'skills', patterns: [/^skills$/i, /^technical skills$/i, /^core skills$/i] },
  { key: 'education', patterns: [/^education$/i, /^academic background$/i] },
  { key: 'achievements', patterns: [/^achievements$/i, /^accomplishments$/i, /^awards$/i] },
  { key: 'certifications', patterns: [/^certifications$/i, /^licenses and certifications$/i] },
];

const DOMAIN_TERMS = [
  'fintech', 'saas', 'healthtech', 'edtech', 'retail', 'retail-tech', 'ecommerce', 'marketplace',
  'developer platforms', 'ai', 'ai-native', 'cloud', 'payments', 'lending', 'hr', 'people operations',
  'product', 'risk operations', 'workflow automation', 'healthcare',
];

const TOOL_TERMS = [
  'AWS', 'Azure', 'GCP', 'React', 'Next.js', 'TypeScript', 'JavaScript', 'Java', 'Spring Boot', 'Node.js',
  'Python', 'SQL', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Kafka', 'Docker', 'Kubernetes', 'Terraform',
  'Git', 'GitHub Actions', 'Figma', 'FigJam', 'Jira', 'Confluence', 'Notion', 'Mixpanel', 'Amplitude',
  'Metabase', 'Power BI', 'Tableau', 'Excel', 'Greenhouse', 'Darwinbox', 'Keka', 'Postman', 'Storybook',
  'Maze', 'Miro', 'Zeplin', 'SQS', 'ECS', 'CloudWatch',
];

function dedupeStrings(values: unknown[], limit = 12) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= limit) break;
  }
  return result;
}

function resumeLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function identifySection(line: string) {
  for (const section of SECTION_ALIASES) {
    if (section.patterns.some((pattern) => pattern.test(line))) return section.key;
  }
  return null;
}

function collectSections(text: string) {
  const sections: Record<string, string[]> = {
    intro: [],
    target: [],
    experience: [],
    projects: [],
    skills: [],
    education: [],
    achievements: [],
    certifications: [],
    other: [],
  };

  let current: keyof typeof sections = 'intro';
  for (const line of resumeLines(text)) {
    const section = identifySection(line);
    if (section && section in sections) {
      current = section as keyof typeof sections;
      continue;
    }
    sections[current].push(line);
  }
  return sections;
}

function looksLikeContactLine(line: string) {
  return /@|\+?\d[\d\s-]{7,}|linkedin|github|portfolio|behance|dribbble|www\.|https?:\/\//i.test(line);
}

function extractName(lines: string[]) {
  return (
    lines.find((line) => {
      if (looksLikeContactLine(line)) return false;
      if (line.length > 80) return false;
      const words = line.split(/\s+/);
      if (words.length < 2 || words.length > 5) return false;
      return !/\d/.test(line);
    }) ||
    lines[0] ||
    'Candidate'
  );
}

function extractHeadline(sections: ReturnType<typeof collectSections>, lines: string[], name: string) {
  const preferred = [...sections.target, ...sections.intro].find((line) => {
    if (line === name) return false;
    if (looksLikeContactLine(line)) return false;
    return line.length > 20 && line.length < 260;
  });
  const experienceLine = lines.find((line) => /\byears?\s+of\s+experience\b/i.test(line) && !looksLikeContactLine(line) && line.length < 260);
  return preferred || experienceLine || 'Professional profile extracted from the uploaded resume';
}

function inferYearsOfExperience(text: string, experience: Array<{ duration: string }>) {
  const direct = text.match(/\b(\d{1,2})\+?\s+years?\s+of\s+experience\b/i) || text.match(/\b(\d{1,2})\+?\s+years?\b/i);
  if (direct) return Number(direct[1]);

  const years = new Set<number>();
  for (const item of experience) {
    for (const match of item.duration.matchAll(/\b(19|20)\d{2}\b/g)) {
      years.add(Number(match[0]));
    }
  }
  if (!years.size) return undefined;
  const earliest = Math.min(...years);
  const latest = Math.max(...years);
  const currentYear = new Date().getFullYear();
  const endYear = /present|current/i.test(text) ? currentYear : latest;
  const estimated = Math.max(0, endYear - earliest);
  return estimated || undefined;
}

function inferSeniority(years?: number) {
  if (!years || years < 2) return 'Junior';
  if (years < 5) return 'Mid-level';
  if (years < 8) return 'Senior';
  return 'Lead';
}

function cleanBullet(line: string) {
  return line.replace(/^[-*•]\s*/, '').trim();
}

function parseExperience(lines: string[]) {
  const entries: Array<{ role: string; company: string; duration: string; summary: string }> = [];
  let current: { role: string; company: string; duration: string; bullets: string[] } | null = null;

  const flush = () => {
    if (!current) return;
    entries.push({
      role: current.role || 'Experience',
      company: current.company,
      duration: current.duration,
      summary: current.bullets.slice(0, 3).join(' '),
    });
    current = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const isBullet = /^[-*•]\s+/.test(line);
    const durationMatch = line.match(/((jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+)?(19|20)\d{2}\s*[-–to]+\s*(((jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+)?(19|20)\d{2}|present|current)/i);
    const looksLikeHeader = Boolean(durationMatch) || (!isBullet && /,\s*(present|current|(19|20)\d{2})/i.test(line));

    if (looksLikeHeader) {
      flush();
      const duration = durationMatch?.[0] || '';
      const withoutDuration = duration ? line.replace(duration, '').replace(/[,\-–to]+$/i, '').trim() : line;
      const parts = withoutDuration.split(',').map((part) => part.trim()).filter(Boolean);
      const first = parts[0] || withoutDuration;
      const second = parts[1] || '';
      current = {
        role: first,
        company: second,
        duration,
        bullets: [],
      };
      continue;
    }

    if (!current) continue;
    current.bullets.push(cleanBullet(line));
  }

  flush();
  return entries.slice(0, 8);
}

function parseEducation(lines: string[]) {
  return lines
    .map((line) => {
      const yearMatch = line.match(/\b(19|20)\d{2}\b/);
      const parts = line.split(',').map((part) => part.trim()).filter(Boolean);
      return {
        degree: parts[0] || line,
        institution: parts[1] || parts[0] || '',
        year: yearMatch?.[0] || '',
      };
    })
    .filter((item) => item.degree)
    .slice(0, 4);
}

function parseProjects(lines: string[], skills: string[]) {
  const projects: Array<{ name: string; description: string; technologies: string[] }> = [];
  let currentName = '';
  let currentLines: string[] = [];

  const flush = () => {
    if (!currentName && !currentLines.length) return;
    const description = currentLines.join(' ').trim();
    const technologies = skills.filter((skill) => description.toLowerCase().includes(skill.toLowerCase())).slice(0, 6);
    projects.push({
      name: currentName || 'Project',
      description: description || currentName,
      technologies,
    });
    currentName = '';
    currentLines = [];
  };

  for (const line of lines) {
    if (!/^[-*•]\s+/.test(line) && line.length < 120) {
      flush();
      currentName = line;
      continue;
    }
    currentLines.push(cleanBullet(line));
  }

  flush();
  return projects.slice(0, 5);
}

function splitSkillTokens(lines: string[]) {
  const joined = lines
    .map((line) => line.replace(/^[A-Za-z /&]+:\s*/, '').trim())
    .join(', ');
  return dedupeStrings(
    joined
      .split(/[|,;/]+/)
      .map((part) => part.trim().replace(/[.]+$/g, ''))
      .filter((part) => part.length >= 2 && part.length <= 40),
    24,
  );
}

function inferDomains(text: string) {
  const lower = text.toLowerCase();
  return dedupeStrings(DOMAIN_TERMS.filter((term) => lower.includes(term.toLowerCase())), 8);
}

function inferTools(text: string, explicitSkills: string[]) {
  const lower = text.toLowerCase();
  const matched = TOOL_TERMS.filter((term) => lower.includes(term.toLowerCase()));
  return dedupeStrings([
    ...explicitSkills.filter((skill) => TOOL_TERMS.some((term) => term.toLowerCase() === skill.toLowerCase())),
    ...matched,
  ], 16);
}

function inferAchievements(sections: ReturnType<typeof collectSections>, experience: Array<{ summary: string }>) {
  const candidates = [
    ...sections.achievements.map(cleanBullet),
    ...sections.experience.filter((line) => /^[-*•]\s+/.test(line)).map(cleanBullet),
    ...experience.map((item) => item.summary).filter(Boolean),
  ];
  return dedupeStrings(
    candidates.filter((line) => /\d|reduced|improved|launched|built|led|award|mentored|optimized|increased/i.test(line)),
    10,
  );
}

function inferInferredSkills(text: string, explicitSkills: string[]) {
  const lower = text.toLowerCase();
  const inferred = [
    lower.includes('stakeholder') ? 'Stakeholder management' : '',
    /mentor|mentored|coached/i.test(text) ? 'Mentoring' : '',
    /experiment|a\/b|funnel|cohort|analytics/i.test(text) ? 'Data-informed decision making' : '',
    /roadmap|prd|discovery/i.test(text) ? 'Product discovery' : '',
    /research|usability|prototype/i.test(text) ? 'User research' : '',
    /incident|production|observability/i.test(text) ? 'Production ownership' : '',
    /partnered|cross-functional|collaborat/i.test(text) ? 'Cross-functional collaboration' : '',
  ];
  return dedupeStrings([...inferred, ...explicitSkills.slice(0, 3)], 8);
}

export function buildDeterministicProfileFromResumeText(text: string, failureReason?: string): ExtractProfileResult {
  const sections = collectSections(text);
  const lines = resumeLines(text);
  const fullName = extractName(lines);
  const headline = extractHeadline(sections, lines, fullName);
  const explicitSkills = splitSkillTokens(sections.skills);
  const experience = parseExperience(sections.experience);
  const education = parseEducation(sections.education);
  const yearsOfExperience = inferYearsOfExperience(text, experience);
  const tools = inferTools(text, explicitSkills);
  const domains = inferDomains(text);
  const achievements = inferAchievements(sections, experience);
  const projects = parseProjects(sections.projects, [...explicitSkills, ...tools]);
  const certifications = dedupeStrings(sections.certifications.map(cleanBullet), 8);
  const inferredSkills = inferInferredSkills(text, explicitSkills);
  const strengths = dedupeStrings([
    ...explicitSkills.slice(0, 5),
    ...inferredSkills.slice(0, 4),
  ], 8);
  const rawSummary = dedupeStrings([
    headline,
    ...experience.map((item) => item.summary).filter(Boolean),
  ], 2).join(' ');
  const gaps = dedupeStrings([
    !experience.length ? 'Work experience needs manual review because the resume structure was hard to parse.' : '',
    !education.length ? 'Education details may need manual confirmation.' : '',
    failureReason ? `Gemini extraction fallback used: ${failureReason}` : '',
  ], 3);

  const extractedSignals = [
    explicitSkills.length ? 'skills' : '',
    experience.length ? 'experience' : '',
    education.length ? 'education' : '',
    projects.length ? 'projects' : '',
  ].filter(Boolean);
  const confidence = Math.max(38, Math.min(74, 42 + extractedSignals.length * 7 + Math.min(10, achievements.length)));

  return {
    profile: ProfileSchema.parse({
      fullName,
      headline,
      yearsOfExperience,
      targetSeniority: inferSeniority(yearsOfExperience),
      skills: {
        explicit: explicitSkills,
        inferred: inferredSkills,
      },
      tools,
      domains,
      experience,
      projects,
      achievements,
      education,
      certifications,
      strengths,
      gaps,
      rawSummary: rawSummary || headline,
      metadata: {
        confidenceNotes: 'Deterministic profile extracted from resume text because Gemini extraction was unavailable or unreliable.',
      },
    }),
    analysis: {
      confidence,
      confidenceNotes: 'Deterministic fallback extracted a usable profile from the parsed resume text. Please review and clarify any uncertain fields before scanning jobs.',
      extractionIssues: dedupeStrings([
        failureReason ? `Gemini extraction issue: ${failureReason}` : '',
        !experience.length ? 'Could not confidently parse structured work experience.' : '',
        !education.length ? 'Could not confidently parse education details.' : '',
      ], 4),
      needsClarification: true,
      clarificationQuestions: [
        {
          id: 'current_status_notice_period',
          question: 'What is your current role, current city, and notice period?',
          reason: 'The fallback profile is usable, but these facts help ground matching and recruiter outreach.',
          field: 'availability',
          type: 'short_text',
        },
        {
          id: 'salary_location_preference',
          question: 'What salary range and locations should the search prioritize?',
          reason: 'These details are often missing from resumes and improve job ranking quality.',
          field: 'search_preferences',
          type: 'short_text',
        },
      ],
    },
  };
}

function classifyGeminiError(error: any): GeminiValidationResult {
  const message = safeAiErrorMessage(error).toLowerCase();
  const status = Number(error?.status || error?.code || 0);

  if (status === 401 || status === 403 || message.includes('api key not valid') || message.includes('permission')) {
    return {
      success: false,
      category: 'invalid',
      message: 'That Gemini key was rejected.',
      action: 'Check that you copied the full key from Google AI Studio and that the key is enabled.',
    };
  }

  if (status === 429 || message.includes('quota') || message.includes('rate') || message.includes('exhausted')) {
    return {
      success: false,
      category: 'quota',
      message: 'Gemini says the key is currently rate-limited or out of quota.',
      action: 'Wait a few minutes, try a different key, or check quota in Google AI Studio.',
    };
  }

  if (message.includes('timeout') || message.includes('deadline')) {
    return {
      success: false,
      category: 'timeout',
      message: 'Gemini did not respond in time.',
      action: 'Try again. If this keeps happening, check your connection or retry with a lighter network load.',
    };
  }

  if (message.includes('fetch failed') || message.includes('network') || message.includes('econn') || message.includes('enotfound')) {
    return {
      success: false,
      category: 'connectivity',
      message: 'Could not reach Gemini from this machine.',
      action: 'Check internet connectivity, DNS/VPN/proxy settings, then retry.',
    };
  }

  return {
    success: false,
    category: 'unknown',
    message: 'Gemini validation failed unexpectedly.',
    action: 'Retry once. If it still fails, open Settings and re-check the key.',
  };
}

function buildGatewayEnv(apiKey?: string) {
  const config = getAppConfig();
  const env = getAIRuntimeEnv(config);
  if (!apiKey?.trim()) return env;

  return {
    ...env,
    CAREER_SEEK_AI_PROVIDER: 'gemini',
    GEMINI_API_KEY: apiKey.trim(),
    GOOGLE_GENERATIVE_AI_API_KEY: apiKey.trim(),
  };
}

async function generateGatewayText(
  prompt: string,
  config: any | undefined,
  taskType: string,
  apiKey?: string,
) {
  const manager = getAIManager({ env: buildGatewayEnv(apiKey) });
  const result = await manager.generate({
    userPrompt: prompt,
    temperature: config?.temperature,
    maxTokens: config?.maxOutputTokens,
    responseFormat: config?.responseMimeType === 'application/json' ? 'json' : 'text',
    metadata: { taskType, legacyEntrypoint: 'services/gemini.generateWithFallback' },
  });
  return result.text;
}

/**
 * Backward-compatible generation entrypoint. The implementation now routes
 * through the model-agnostic gateway; the first argument is ignored.
 */
export async function generateWithFallback(
  _legacyClient: unknown,
  prompt: string,
  config?: any,
  taskType: string = 'custom'
): Promise<string> {
  const startTime = Date.now();

  const simulated = simulatedGeminiResponse(taskType, prompt);
  if (simulated) {
    await logAiRequest({
      taskType: taskType as any,
      modelUsed: 'validation-simulated-gemini',
      latencyMs: Date.now() - startTime,
      succeeded: true,
      metadata: { simulated: true },
    });
    return simulated;
  }

  try {
    const text = await generateGatewayText(prompt, config, taskType);
    await logAiRequest({
      taskType: taskType as any,
      modelUsed: 'model-gateway',
      latencyMs: Date.now() - startTime,
      succeeded: true,
      metadata: { providerAgnostic: true },
    });
    return text;
  } catch (error) {
    await logAiRequest({
      taskType: taskType as any,
      modelUsed: 'model-gateway',
      latencyMs: Date.now() - startTime,
      succeeded: false,
      errorMessage: safeAiErrorMessage(error),
      metadata: { providerAgnostic: true },
    });
    throw error;
  }
}

/**
 * Validates a Gemini API key by making a tiny test request.
 */
export async function validateApiKey(apiKey: string): Promise<boolean> {
  const result = await validateApiKeyDetailed(apiKey);
  return result.success;
}

export async function validateApiKeyDetailed(apiKey: string): Promise<GeminiValidationResult> {
  if (!apiKey?.trim()) {
    return {
      success: false,
      category: 'missing',
      message: 'A Gemini API key is required before resume analysis can run.',
      action: 'Paste a key from Google AI Studio to continue.',
    };
  }

  const simulated = process.env.JOBHUNT_SIMULATE_GEMINI;
  if (simulated && simulated !== 'valid') {
    if (simulated === 'invalid') return classifyGeminiError({ status: 401, message: 'API key not valid' });
    if (simulated === 'timeout') return classifyGeminiError(new Error('timeout while validating Gemini key'));
    if (simulated === 'quota') return classifyGeminiError({ status: 429, message: 'quota exhausted' });
    if (simulated === 'connectivity') return classifyGeminiError(new Error('fetch failed: network unreachable'));
  }
  if (simulated === 'valid') {
    return {
      success: true,
      category: 'valid',
      message: 'Gemini key validated.',
      action: 'Continue to resume upload.',
    };
  }

  try {
    const validationPromise = generateGatewayText(
      "Respond with only the word ok.",
      { temperature: 0 },
      'validate_key',
      apiKey,
    );
    const timeoutPromise = new Promise<string>((_, reject) => {
      setTimeout(() => reject(new Error('timeout while validating Gemini key')), 12000);
    });
    const text = await Promise.race([validationPromise, timeoutPromise]);
    if (text.toLowerCase().includes('ok')) {
      return {
        success: true,
        category: 'valid',
        message: 'Gemini key validated.',
        action: 'Continue to resume upload.',
      };
    }

    return {
      success: false,
      category: 'invalid',
      message: 'Gemini responded, but not with the expected validation response.',
      action: 'Please re-check the key and try again.',
    };
  } catch (error: any) {
    console.error(`Gemini API key validation failed: ${safeAiErrorMessage(error)}`);
    return classifyGeminiError(error);
  }
}

/**
 * Extracts a structured MasterProfile from raw resume text using Gemini.
 */
export async function extractProfile(text: string, apiKey: string): Promise<MasterProfile> {
  const result = await extractProfileWithAnalysis(text, apiKey);
  return result.profile;
}

/**
 * Extracts a profile and asks Gemini to identify uncertainty before the user scans jobs.
 */
export async function extractProfileWithAnalysis(text: string, apiKey: string): Promise<ExtractProfileResult> {
  const config = {
    temperature: 0.2,
    responseMimeType: "application/json",
  };

  const prompt = `
  You are an expert career advisor and resume parser.
  Extract the professional profile from the following resume text.
  Also inspect extraction risk: scanned PDF/OCR weakness, two-column ordering, broken dates, overlapping roles,
  missing latest role, unclear company-title pairing, duplicate bullets, misread links, education mistaken as work,
  certifications mistaken as degrees, summary mistaken as title, tables/icons corrupting order, and Present/Current handling.
  Respond ONLY with a JSON object that perfectly matches this schema:
  {
    "profile": {
      "fullName": "string",
      "headline": "string (inferred professional identity if not explicit)",
      "yearsOfExperience": number (estimated),
      "targetSeniority": "string (e.g. Junior, Mid, Senior, Lead, Staff)",
      "skills": {
        "explicit": ["string"],
        "inferred": ["string (skills they likely have based on their experience but didn't explicitly list)"]
      },
      "tools": ["string (software, frameworks, platforms)"],
      "domains": ["string (industries or business domains)"],
      "experience": [
        { "role": "string", "company": "string", "duration": "string", "summary": "string" }
      ],
      "projects": [
        { "name": "string", "description": "string", "technologies": ["string"] }
      ],
      "achievements": ["string (quantifiable accomplishments)"],
      "education": [
        { "degree": "string", "institution": "string", "year": "string" }
      ],
      "certifications": ["string"],
      "strengths": ["string (inferred professional strengths)"],
      "gaps": ["string (inferred missing clarity or weak areas in the resume)"],
      "rawSummary": "string (a brief summary of the candidate)",
      "metadata": {
        "confidenceNotes": "string (any caveats or notes about extraction confidence)"
      }
    },
    "analysis": {
      "confidence": number (0-100),
      "confidenceNotes": "string",
      "extractionIssues": ["string"],
      "needsClarification": boolean,
      "clarificationQuestions": [
        {
          "id": "stable_snake_case_id",
          "question": "string",
          "reason": "string",
          "field": "string",
          "type": "short_text",
          "options": ["string"]
        }
      ]
    }
  }

  Resume Text:
  ${text}
  `;

  try {
    const responseText = await generateGatewayText(prompt, config, 'extract_profile', apiKey);
    const parsedData = parseGeminiJson<any>(responseText);
    const rawProfile = parsedData.profile || parsedData;
    const profile = ProfileSchema.parse(rawProfile);
    const analysis: ResumeAnalysisResult = {
      confidence: Math.max(0, Math.min(100, Number(parsedData.analysis?.confidence ?? 75))),
      confidenceNotes: parsedData.analysis?.confidenceNotes || profile.metadata?.confidenceNotes || 'The selected AI provider extracted the resume with moderate confidence.',
      extractionIssues: Array.isArray(parsedData.analysis?.extractionIssues) ? parsedData.analysis.extractionIssues : [],
      needsClarification: Boolean(parsedData.analysis?.needsClarification),
      clarificationQuestions: Array.isArray(parsedData.analysis?.clarificationQuestions)
        ? parsedData.analysis.clarificationQuestions.slice(0, 8).map((q: any, index: number) => ({
            id: q.id || `clarification_${index + 1}`,
            question: q.question || 'Please clarify this resume detail.',
            reason: q.reason || 'The selected AI provider was not fully confident about this field.',
            field: q.field,
            type: q.type || 'short_text',
            options: Array.isArray(q.options) ? q.options : undefined,
          }))
        : [],
    };

    if (analysis.confidence < 70 && analysis.clarificationQuestions.length === 0) {
      analysis.needsClarification = true;
      analysis.clarificationQuestions.push({
        id: 'overall_resume_confidence',
        question: 'What is your current or most recent role, current city, and total years of experience?',
        reason: 'The resume extraction had low confidence and needs a quick grounding answer.',
        field: 'profile_summary',
        type: 'long_text',
      });
    }
    
    return { profile, analysis };
  } catch (error) {
    const reason = safeAiErrorMessage(error);
    console.error(`Profile extraction failed; using deterministic fallback: ${reason}`);
    return buildDeterministicProfileFromResumeText(text, reason);
  }
}

export async function refineProfileWithClarifications({
  resumeText,
  currentProfile,
  answers,
  questions = [],
  apiKey,
}: ClarificationRefinementInput): Promise<MasterProfile> {
  const usefulAnswers = Object.entries(answers)
    .map(([id, answer]) => ({ id, answer: answer.trim(), question: questions.find((q) => q.id === id)?.question }))
    .filter((item) => item.answer.length > 0);

  if (usefulAnswers.length === 0) {
    return currentProfile;
  }

  const prompt = `
You are refining a structured candidate profile after the user answered clarification questions.

Rules:
1. Preserve all existing candidate facts unless an answer clearly corrects them.
2. Use the clarification answers as trusted user-provided facts.
3. Never invent employers, metrics, degrees, dates, tools, or achievements.
4. If an answer is broad context, fold it into rawSummary, strengths, gaps, or the most relevant existing field.
5. Return only the updated profile JSON matching the existing schema.

Current Profile:
${JSON.stringify(currentProfile, null, 2)}

Clarification Answers:
${JSON.stringify(usefulAnswers, null, 2)}

Original Resume Text:
${resumeText.slice(0, 18_000)}
`;

  const responseText = await generateGatewayText(
    prompt,
    {
      temperature: 0.15,
      responseMimeType: 'application/json',
    },
    'refine_profile',
    apiKey,
  );
  const parsed = parseGeminiJson<any>(responseText);
  return ProfileSchema.parse(parsed.profile || parsed);
}
