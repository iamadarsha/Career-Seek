import { z } from 'zod';
import { getDb } from '../../../db';
import { jdAnalyses, scoredJobs, normalizedJobs } from '../../../db/schema';
import { eq, and } from 'drizzle-orm';
import { resolveContext } from '@/lib/platform/identity';
import { getAIRuntimeEnv, getAppConfig } from '../../config';
import { getAIManager } from '../../ai/manager';

export const JdAnalysisSchema = z.object({
  mustHaveSkills: z.array(z.string()),
  preferredSkills: z.array(z.string()),
  atsKeywords: z.array(z.string()),
  domainLanguage: z.array(z.string()),
  senioritySignals: z.array(z.string()),
  leadershipSignals: z.array(z.string()),
  toolRequirements: z.array(z.string()),
  businessContext: z.string(),
  hiringPriorities: z.string(),
});

export type JdAnalysis = z.infer<typeof JdAnalysisSchema>;

export interface DocumentAIJsonResult<T> {
  data: T;
  provider: string;
  model: string;
  text: string;
}

export function safeDocumentAiErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error ?? 'Unknown AI error');
  return raw
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[redacted-api-key]')
    .replace(/sk-[0-9A-Za-z_-]{20,}/g, '[redacted-api-key]')
    .replace(/([?&](?:key|api_key)=)[^&\s]+/gi, '$1[redacted]')
    .slice(0, 300);
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

export function parseProviderJson<T = any>(text: string): T {
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

export async function generateDocumentJson<T>(
  prompt: string,
  taskType: string,
  options: { temperature: number; maxTokens?: number; schema?: unknown },
): Promise<DocumentAIJsonResult<T>> {
  const appConfig = getAppConfig();
  const manager = getAIManager({ env: getAIRuntimeEnv(appConfig) });
  const response = await manager.generate<T>({
    userPrompt: prompt,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    responseFormat: options.schema ? { type: 'json', schema: options.schema } : 'json',
    metadata: {
      taskType,
      feature: 'document_generation',
    },
  });

  return {
    data: (response.parsed ?? parseProviderJson<T>(response.text)) as T,
    provider: response.provider,
    model: response.model,
    text: response.text,
  };
}

function uniqueTerms(terms: string[]) {
  return Array.from(new Set(terms.map((term) => term.trim()).filter(Boolean))).slice(0, 12);
}

function parseStoredArray(value: string | null | undefined) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function textHas(text: string, patterns: string[]) {
  return patterns.some((pattern) => text.includes(pattern.toLowerCase()));
}

function termsPresent(text: string, terms: string[]) {
  return terms.filter((term) => text.includes(term.toLowerCase()));
}

function termAppearsInJobText(text: string, term: string) {
  const normalized = term.toLowerCase();
  if (text.includes(normalized)) return true;
  const parts = normalized.split(/\s+/).filter((part) => part.length > 2);
  return parts.length > 1 && parts.every((part) => text.includes(part));
}

function buildFallbackJdAnalysis(job: typeof normalizedJobs.$inferSelect): JdAnalysis {
  const text = `${job.title} ${job.company} ${job.snippet || ''}`.toLowerCase();
  const rolePacks = [
    {
      matches: ['frontend', 'front end', 'react', 'next.js', 'javascript', 'typescript', 'ui engineer'],
      must: ['React', 'TypeScript', 'JavaScript', 'Frontend Engineering', 'UI Development'],
      preferred: ['Next.js', 'Redux', 'Performance Optimization', 'Testing', 'Accessibility'],
      tools: ['React', 'Next.js', 'Redux', 'Jest', 'Storybook'],
      leadership: ['Component ownership', 'Cross-functional delivery'],
    },
    {
      matches: ['teacher', 'pgt', 'physics', 'classroom', 'school', 'curriculum', 'lesson'],
      must: ['Teaching', 'Lesson Planning', 'Classroom Management', 'Subject Expertise'],
      preferred: ['Assessment Design', 'Student Engagement', 'Curriculum Planning', 'Parent Communication'],
      tools: ['LMS', 'Google Classroom', 'Microsoft Office'],
      leadership: ['Student outcomes', 'Academic ownership'],
    },
    {
      matches: ['supply chain', 'logistics', 'warehouse', 'procurement', 'inventory', 'operations'],
      must: ['Supply Chain Management', 'Logistics', 'Inventory Management', 'Operations Management'],
      preferred: ['Vendor Management', 'Process Improvement', 'Demand Planning', 'Cost Optimization'],
      tools: ['ERP', 'Excel', 'SAP', 'WMS'],
      leadership: ['Operational ownership', 'Vendor coordination'],
    },
    {
      matches: ['data analyst', 'data analytics', 'business intelligence', 'sql', 'power bi', 'dashboard', 'intern'],
      must: ['Data Analysis', 'SQL', 'Excel', 'Dashboarding'],
      preferred: ['Python', 'Power BI', 'Tableau', 'Statistics', 'Business Intelligence'],
      tools: ['SQL', 'Excel', 'Python', 'Power BI', 'Tableau'],
      leadership: ['Analytical problem solving', 'Insight communication'],
    },
    {
      matches: ['product manager', 'product owner', 'roadmap', 'saas', 'ai product', 'llm', 'rag'],
      must: ['Product Management', 'Roadmap', 'Stakeholder Management', 'Customer Discovery'],
      preferred: ['AI', 'LLM', 'RAG', 'Experimentation', 'GTM', 'PRD'],
      tools: ['SQL', 'Analytics', 'Jira', 'Figma'],
      leadership: ['Product ownership', 'Cross-functional alignment'],
    },
  ];

  const matchedPacks = rolePacks.filter((pack) => textHas(text, pack.matches));
  const baseTerms = termsPresent(text, [
    'AI', 'LLM', 'RAG', 'React', 'Next.js', 'TypeScript', 'JavaScript', 'Redux', 'SQL',
    'Python', 'Excel', 'Power BI', 'Tableau', 'SaaS', 'Fintech', 'GTM', 'ERP', 'SAP',
    'Supply Chain', 'Logistics', 'Procurement', 'Inventory', 'Teacher', 'Physics',
    'Lesson Planning', 'Classroom Management',
  ]);
  const packMust = matchedPacks.flatMap((pack) => {
    const present = pack.must.filter((term) => termAppearsInJobText(text, term));
    return present.length ? present : pack.must.slice(0, 2);
  });
  const packPreferred = matchedPacks.flatMap((pack) => pack.preferred.filter((term) => termAppearsInJobText(text, term)));
  const packTools = matchedPacks.flatMap((pack) => pack.tools).filter((term) => text.includes(term.toLowerCase()));
  const mustHaveSkills = uniqueTerms(baseTerms.length || packMust.length ? [...baseTerms, ...packMust] : [job.title, 'Role-relevant execution']);
  const preferredSkills = uniqueTerms(packPreferred.length ? packPreferred : ['Cross-functional execution', 'Communication', 'Practical problem solving']);
  const toolRequirements = uniqueTerms([...packTools, ...termsPresent(text, ['SQL', 'Python', 'Excel', 'Power BI', 'Tableau', 'React', 'Next.js', 'SAP', 'ERP'])]);
  const atsKeywords = uniqueTerms([...mustHaveSkills, ...preferredSkills.slice(0, 5), job.title, job.company]);

  return {
    mustHaveSkills,
    preferredSkills,
    atsKeywords,
    domainLanguage: uniqueTerms([job.portal, job.employmentType || '', job.location || '', job.snippet || ''].join(' ').split(/[,.;|/]+/)),
    senioritySignals: uniqueTerms(['Ownership', ...matchedPacks.flatMap((pack) => pack.leadership)]),
    leadershipSignals: uniqueTerms(['Stakeholder alignment', 'Cross-functional collaboration', ...matchedPacks.flatMap((pack) => pack.leadership)]),
    toolRequirements,
    businessContext: job.snippet
      ? job.snippet.slice(0, 240)
      : `${job.company} is hiring for ${job.title}.`,
    hiringPriorities: `Likely looking for a candidate who can show relevant ${job.title} experience, practical execution, and clear evidence matched to the role.`,
  };
}

function persistJdAnalysis(scoredJobId: number, validated: JdAnalysis) {
  const db = getDb();
  db.insert(jdAnalyses).values({
    scoredJobId,
    mustHaveSkills: JSON.stringify(validated.mustHaveSkills),
    preferredSkills: JSON.stringify(validated.preferredSkills),
    atsKeywords: JSON.stringify(validated.atsKeywords),
    domainLanguage: JSON.stringify(validated.domainLanguage),
    senioritySignals: JSON.stringify(validated.senioritySignals),
    leadershipSignals: JSON.stringify(validated.leadershipSignals),
    toolRequirements: JSON.stringify(validated.toolRequirements),
    businessContext: validated.businessContext,
    hiringPriorities: validated.hiringPriorities,
    analyzedAt: new Date(),
  }).run();
}

export async function analyzeJd(scoredJobId: number): Promise<JdAnalysis | null> {
  const db = getDb();
  const { profileId } = resolveContext();
  
  // Check cache and verify ownership
  const existing = db.select({
    id: jdAnalyses.id,
    mustHaveSkills: jdAnalyses.mustHaveSkills,
    preferredSkills: jdAnalyses.preferredSkills,
    atsKeywords: jdAnalyses.atsKeywords,
    domainLanguage: jdAnalyses.domainLanguage,
    senioritySignals: jdAnalyses.senioritySignals,
    leadershipSignals: jdAnalyses.leadershipSignals,
    toolRequirements: jdAnalyses.toolRequirements,
    businessContext: jdAnalyses.businessContext,
    hiringPriorities: jdAnalyses.hiringPriorities,
  })
    .from(jdAnalyses)
    .innerJoin(scoredJobs, eq(jdAnalyses.scoredJobId, scoredJobs.id))
    .where(and(eq(jdAnalyses.scoredJobId, scoredJobId), eq(scoredJobs.profileId, profileId)))
    .get();

  if (existing) {
    return {
      mustHaveSkills: parseStoredArray(existing.mustHaveSkills),
      preferredSkills: parseStoredArray(existing.preferredSkills),
      atsKeywords: parseStoredArray(existing.atsKeywords),
      domainLanguage: parseStoredArray(existing.domainLanguage),
      senioritySignals: parseStoredArray(existing.senioritySignals),
      leadershipSignals: parseStoredArray(existing.leadershipSignals),
      toolRequirements: parseStoredArray(existing.toolRequirements),
      businessContext: existing.businessContext || '',
      hiringPriorities: existing.hiringPriorities || '',
    };
  }

  // Get job details with ownership check
  const job = db.select()
    .from(scoredJobs)
    .innerJoin(normalizedJobs, eq(scoredJobs.normalizedJobId, normalizedJobs.id))
    .where(and(eq(scoredJobs.id, scoredJobId), eq(scoredJobs.profileId, profileId)))
    .get();

  if (!job) {
    throw new Error('Scored job not found');
  }

  const prompt = `
    Analyze the following Job Description to extract structured signals for resume tailoring and interview prep.
    Focus on extracting precise, atomic terms where lists are expected.

    Job Title: ${job.normalized_jobs.title}
    Company: ${job.normalized_jobs.company}
    Location: ${job.normalized_jobs.location || 'Not specified'}
    Employment Type: ${job.normalized_jobs.employmentType || 'Not specified'}
    Description/Snippet: ${job.normalized_jobs.snippet}
    
    Respond STRICTLY with a JSON object that matches this schema:
    {
      "mustHaveSkills": ["string"],
      "preferredSkills": ["string"],
      "atsKeywords": ["string", "important terms"],
      "domainLanguage": ["string", "industry jargon"],
      "senioritySignals": ["string", "e.g., leads a team, mentors, owns architecture"],
      "leadershipSignals": ["string"],
      "toolRequirements": ["string", "software/platforms"],
      "businessContext": "1-2 sentences on what the company/team does",
      "hiringPriorities": "1-2 sentences on what they are likely looking for right now"
    }
  `;

  try {
    const { data } = await generateDocumentJson(prompt, 'jd_analysis', {
      temperature: 0.1,
      schema: JdAnalysisSchema,
    });
    const validated = JdAnalysisSchema.parse(data);

    persistJdAnalysis(scoredJobId, validated);

    return validated;
  } catch (error) {
    console.error(`Failed to analyze JD with the selected AI provider; using deterministic fallback: ${safeDocumentAiErrorMessage(error)}`);
    const fallback = buildFallbackJdAnalysis(job.normalized_jobs);
    persistJdAnalysis(scoredJobId, fallback);
    return fallback;
  }
}
