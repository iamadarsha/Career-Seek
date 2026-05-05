import { z } from 'zod';
import { getDb } from '../../../db';
import { masterProfiles } from '../../../db/schema';
import { eq, and } from 'drizzle-orm';
import { resolveContext } from '@/lib/platform/identity';
import { generateDocumentJson, JdAnalysis, safeDocumentAiErrorMessage } from './analysis';

export const TailoredResumeSchema = z.object({
  fullName: z.string(),
  headline: z.string(),
  contact: z.object({
    location: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    linkedin: z.string().optional(),
  }).optional(),
  summary: z.string(),
  skillCategories: z.array(z.object({
    category: z.string(),
    skills: z.array(z.string()),
  })).optional(),
  // legacy flat list still accepted so existing consumers don't break
  skills: z.array(z.string()).optional(),
  tools: z.array(z.string()).optional(),
  experience: z.array(z.object({
    role: z.string(),
    company: z.string(),
    location: z.string().optional(),
    duration: z.string(),
    bullets: z.array(z.string()),
  })),
  projects: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    technologies: z.array(z.string()).optional(),
    bullets: z.array(z.string()),
  })).optional(),
  education: z.array(z.object({
    degree: z.string(),
    institution: z.string(),
    year: z.string(),
    description: z.string().optional(),
  })),
  certifications: z.array(z.string()).optional(),
});

export type TailoredResume = z.infer<typeof TailoredResumeSchema>;

function safeArray(value: unknown): any[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeText(value: unknown) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueStrings(values: unknown[], limit = 24) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    const key = normalizeText(text);
    if (!text || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= limit) break;
  }
  return result;
}

function profileSourceText(profile: typeof masterProfiles.$inferSelect) {
  return normalizeText([
    profile.fullName,
    profile.headline,
    profile.rawSummary,
    JSON.stringify(safeArray(profile.skillsExplicit)),
    JSON.stringify(safeArray(profile.skillsInferred)),
    JSON.stringify(safeArray(profile.tools)),
    JSON.stringify(safeArray(profile.domains)),
    JSON.stringify(safeArray(profile.experience)),
    JSON.stringify(safeArray(profile.projects)),
    JSON.stringify(safeArray(profile.achievements)),
    JSON.stringify(safeArray(profile.education)),
    JSON.stringify(safeArray(profile.certifications)),
  ].filter(Boolean).join(' '));
}

// --- Fallback (deterministic) ---

function sourceExperience(profile: typeof masterProfiles.$inferSelect) {
  return safeArray(profile.experience).map((item: any) => ({
    role: String(item?.role || item?.title || '').trim(),
    company: String(item?.company || item?.organization || '').trim(),
    location: String(item?.location || '').trim(),
    duration: String(item?.duration || item?.dates || '').trim(),
    summary: String(item?.summary || item?.description || '').trim(),
    bullets: Array.isArray(item?.bullets) ? item.bullets.map((b: unknown) => String(b || '').trim()).filter(Boolean) : [],
  }));
}

function sourceEducation(profile: typeof masterProfiles.$inferSelect) {
  return safeArray(profile.education).map((item: any) => ({
    degree: String(item?.degree || item?.qualification || 'Education').trim(),
    institution: String(item?.institution || item?.school || '').trim(),
    year: String(item?.year || item?.duration || '').trim(),
    description: String(item?.description || item?.field || '').trim(),
  }));
}

function sourceProjects(profile: typeof masterProfiles.$inferSelect) {
  return safeArray(profile.projects).slice(0, 5).map((item: any) => ({
    name: String(item?.name || item?.title || 'Project').trim(),
    description: String(item?.description || item?.summary || '').trim(),
    technologies: Array.isArray(item?.technologies) ? item.technologies.map(String) : [],
    bullets: Array.isArray(item?.bullets) ? item.bullets.map((b: unknown) => String(b || '').trim()).filter(Boolean) : [],
  }));
}

function fallbackTailoredResume(
  profile: typeof masterProfiles.$inferSelect,
  jdAnalysis: JdAnalysis,
  jobContext: any,
): TailoredResume {
  const experience = sourceExperience(profile);
  const education = sourceEducation(profile);
  const projects = sourceProjects(profile);
  const allSkills = uniqueStrings([
    ...safeArray(profile.skillsExplicit),
    ...safeArray(profile.skillsInferred),
    ...safeArray(profile.domains),
  ], 30);
  const allTools = uniqueStrings(safeArray(profile.tools), 16);
  const summary = String(profile.rawSummary || profile.headline || '').slice(0, 500);

  return {
    fullName: profile.fullName || 'Name not provided',
    headline: profile.headline ? `${profile.headline} | Targeting ${jobContext.title}` : `Targeting ${jobContext.title}`,
    contact: { location: 'India' },
    summary: summary || `Experienced professional targeting ${jobContext.title} at ${jobContext.company}.`,
    skillCategories: [
      { category: 'Core Skills', skills: allSkills.slice(0, 12) },
      { category: 'Tools & Platforms', skills: allTools.slice(0, 10) },
    ].filter((cat) => cat.skills.length > 0),
    skills: allSkills,
    tools: allTools,
    experience: experience.length
      ? experience.map((item) => ({
        role: item.role || 'Experience',
        company: item.company,
        location: item.location,
        duration: item.duration,
        bullets: uniqueStrings([item.summary, ...item.bullets], 4),
      }))
      : [{ role: jobContext.title, company: '', duration: '', bullets: [summary].filter(Boolean) }],
    projects: projects.length ? projects : undefined,
    education,
    certifications: uniqueStrings(safeArray(profile.certifications), 8),
  };
}

// --- Grounding check (light — only catches fabricated identities) ---

function generatedResumeText(resume: TailoredResume) {
  return normalizeText(JSON.stringify(resume));
}

function experienceMatchesSource(
  generated: TailoredResume['experience'][number],
  source: ReturnType<typeof sourceExperience>,
) {
  const generatedCompany = normalizeText(generated.company);
  const generatedRole = normalizeText(generated.role);
  return source.some((item) => {
    const sourceCompany = normalizeText(item.company);
    const sourceRole = normalizeText(item.role);
    return (
      (generatedCompany && sourceCompany && (generatedCompany.includes(sourceCompany) || sourceCompany.includes(generatedCompany))) ||
      (generatedRole && sourceRole && (generatedRole.includes(sourceRole) || sourceRole.includes(generatedRole)))
    );
  });
}

function unsupportedMetric(rawOutputText: string, normalizedSourceText: string) {
  const metrics = rawOutputText.toLowerCase().match(/\b\d+(?:\.\d+)?\s*(?:%|percent|x|k|m|million|crore|lakh)\b/g) || [];
  return metrics.find((metric) => !normalizedSourceText.includes(normalizeText(metric)));
}

function findGroundingIssue(resume: TailoredResume, profile: typeof masterProfiles.$inferSelect) {
  const profileName = normalizeText(profile.fullName);
  const resumeName = normalizeText(resume.fullName);
  if (profileName && resumeName && resumeName !== profileName && !resumeName.includes(profileName) && !profileName.includes(resumeName)) {
    return 'generated full name does not match the master profile';
  }

  const sourceText = profileSourceText(profile);
  const outputText = generatedResumeText(resume);
  const foreignMarkers = ['asha mehta', 'fintech cloud india', 'saasworks', 'john doe', 'jane doe', 'sample candidate', 'acme corp'];
  const marker = foreignMarkers.find((value) => outputText.includes(value) && !sourceText.includes(value));
  if (marker) return 'generated resume contains a sample/foreign profile marker';

  if (profileName && ['candidate', 'name not provided'].includes(resumeName)) {
    return 'generated resume used a placeholder name despite a profile name being available';
  }

  const source = sourceExperience(profile);
  if (source.length && resume.experience.length && !resume.experience.some((item) => experienceMatchesSource(item, source))) {
    return 'generated experience does not match the master profile';
  }

  const placeholderCompany = resume.experience.find((item) => ['company', 'master profile', 'acme corp'].includes(normalizeText(item.company)));
  if (placeholderCompany) return 'generated resume contains placeholder company text';

  const rawOutputText = JSON.stringify(resume);
  const metric = unsupportedMetric(rawOutputText, sourceText);
  if (metric) return `generated resume includes a metric not present in the master profile: ${metric}`;

  return null;
}

// --- Main export ---

export async function tailorResume(
  masterProfileId: number,
  jdAnalysis: JdAnalysis,
  jobContext: any,
): Promise<TailoredResume | null> {
  const db = getDb();
  const { profileId } = resolveContext();

  const profile = db.select().from(masterProfiles)
    .where(and(eq(masterProfiles.id, masterProfileId), eq(masterProfiles.profileId, profileId)))
    .get();
  if (!profile) throw new Error('Master profile not found or access denied');

  const expItems = sourceExperience(profile);
  const projectItems = sourceProjects(profile);
  const certItems = uniqueStrings(safeArray(profile.certifications), 10);
  const allSkills = uniqueStrings([
    ...safeArray(profile.skillsExplicit),
    ...safeArray(profile.skillsInferred),
  ], 60);
  const allTools = uniqueStrings(safeArray(profile.tools), 30);
  const allDomains = uniqueStrings(safeArray(profile.domains), 20);

  const jdKeywords = uniqueStrings([
    ...jdAnalysis.mustHaveSkills,
    ...jdAnalysis.atsKeywords,
    ...jdAnalysis.toolRequirements,
    ...jdAnalysis.preferredSkills,
  ], 40);

  const prompt = `
You are a senior executive resume writer and ATS specialist. Your goal is to produce a resume that:
  1. Scores ≥85% on ATS keyword coverage for the target role
  2. Uses ONLY facts, numbers, dates, companies, and technologies that appear in the candidate's master profile — never invent anything
  3. Matches the professional style and section structure of the candidate's reference resumes

ABSOLUTE RULES:
- NEVER invent, hallucinate, or extrapolate experience, metrics, technologies, or companies
- NEVER use placeholder text like "[Company]", "Various Clients", "N/A", or "In Development" for actual companies
- Every quantified metric in the output MUST already appear in the master profile
- If a JD keyword is not supported by the profile, do NOT include it
- Preserve all employer names, job titles, dates, degree names, institutions exactly as they appear in the profile

ATS OPTIMIZATION STRATEGY:
- Place the most critical JD keywords in the professional summary (first 100 words)
- Rewrite experience bullets to lead with JD-aligned action verbs and embed JD keywords naturally
- Create skill categories that mirror the JD's domain language (e.g. if JD says "AI Tooling", use that as a category name)
- Put must-have JD skills first within each category
- Aim for 4-6 strong, specific bullets per role (quality > quantity)
- In project bullets, name technologies and frameworks explicitly — ATS scans for these

CANDIDATE MASTER PROFILE:
Name: ${profile.fullName}
Headline: ${profile.headline}
Location: India
Contact: adarsha.chatterjee@gmail.com | +91 8918077585 | linkedin.com/in/iamadarsha
Raw Summary: ${profile.rawSummary}

Experience:
${expItems.map((e) => `  - ${e.role} at ${e.company} (${e.duration})
    Summary: ${e.summary}
    Bullets: ${e.bullets.join(' | ')}`).join('\n')}

Skills: ${allSkills.join(', ')}
Tools: ${allTools.join(', ')}
Domains: ${allDomains.join(', ')}
Achievements: ${uniqueStrings(safeArray(profile.achievements), 10).join(' | ')}

Projects:
${projectItems.map((p) => `  - ${p.name}: ${p.description} | Tech: ${p.technologies.join(', ')}`).join('\n')}

Education:
${sourceEducation(profile).map((e) => `  - ${e.degree}, ${e.institution} (${e.year}): ${e.description}`).join('\n')}

Certifications: ${certItems.join(', ')}

TARGET JOB:
Title: ${jobContext.title}
Company: ${jobContext.company}
Location: ${jobContext.location || 'India'}
Employment Type: ${jobContext.employmentType || 'Full-time'}
JD Snippet: ${jobContext.snippet || ''}

JD Analysis:
- Must-have skills: ${jdAnalysis.mustHaveSkills.join(', ')}
- Preferred skills: ${jdAnalysis.preferredSkills.join(', ')}
- ATS keywords: ${jdAnalysis.atsKeywords.join(', ')}
- Tool requirements: ${jdAnalysis.toolRequirements.join(', ')}
- Business context: ${jdAnalysis.businessContext}
- Hiring priorities: ${jdAnalysis.hiringPriorities}
- Seniority signals: ${jdAnalysis.senioritySignals.join(', ')}

JD keywords supported by this profile (ONLY use these from the JD list): ${jdKeywords.join(', ')}

OUTPUT: Return a single JSON object matching this schema exactly. Do NOT wrap in markdown fences.
{
  "fullName": "Adarsha Chatterjee",
  "headline": "<role-specific headline, max 12 words, bridge candidate background to ${jobContext.title}>",
  "contact": {
    "location": "Pune, Maharashtra, India",
    "phone": "+91 8918077585",
    "email": "adarsha.chatterjee@gmail.com",
    "linkedin": "linkedin.com/in/iamadarsha"
  },
  "summary": "<3-5 sentence paragraph, first sentence must contain top 2-3 JD keywords, shows impact + expertise + target role fit>",
  "skillCategories": [
    { "category": "<JD-aligned category name>", "skills": ["<skill1>", "<skill2>", ...] },
    ... 4-7 categories total, ordered by JD priority
  ],
  "experience": [
    {
      "role": "<exact title from profile>",
      "company": "<exact company from profile>",
      "location": "<city, country>",
      "duration": "<exact dates from profile>",
      "bullets": [
        "<strong bullet: Action verb + JD keyword + specific outcome/metric if present in profile>",
        ... 4-6 bullets per role
      ]
    }
  ],
  "projects": [
    {
      "name": "<project name from profile>",
      "description": "<one-line description with JD keywords>",
      "technologies": ["<tech1>", "<tech2>"],
      "bullets": ["<bullet1>", "<bullet2>"]
    }
    ... up to 4 projects
  ],
  "education": [
    { "degree": "<exact degree>", "institution": "<exact institution>", "year": "<year>", "description": "<subjects/field>" }
  ],
  "certifications": ["<cert1>", "<cert2>"]
}
`;

  try {
    const { data } = await generateDocumentJson(prompt, 'tailor_resume', {
      temperature: 0.25,
      schema: TailoredResumeSchema,
    });

    const validated = TailoredResumeSchema.parse(data);
    const groundingIssue = findGroundingIssue(validated, profile);
    if (groundingIssue) {
      console.warn(`[resume-tailor] Grounding check failed — using fallback: ${groundingIssue}`);
      return fallbackTailoredResume(profile, jdAnalysis, jobContext);
    }

    return validated;
  } catch (error) {
    console.error(`[resume-tailor] AI generation failed — using fallback: ${safeDocumentAiErrorMessage(error)}`);
    return fallbackTailoredResume(profile, jdAnalysis, jobContext);
  }
}
