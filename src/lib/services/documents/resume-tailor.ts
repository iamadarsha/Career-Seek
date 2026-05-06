import { z } from 'zod';
import { getDb } from '../../../db';
import { masterProfiles, uploadedResumes } from '../../../db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { resolveContext } from '@/lib/platform/identity';
import { generateDocumentJson, JdAnalysis, safeDocumentAiErrorMessage } from './analysis';
import { MASTER_GENERATION_RULES } from './generation-rules';

export const TailoredResumeSchema = z.object({
  fullName: z.string(),
  headline: z.string(),
  contact: z.object({
    location: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    linkedin: z.string().optional(),
    github: z.string().optional(),
    website: z.string().optional(),
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

// --- Fallback (deterministic) ---

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

// --- Grounding check ---

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

function findGroundingIssue(
  resume: TailoredResume,
  profile: typeof masterProfiles.$inferSelect,
  rawResumeText: string,
) {
  const profileName = normalizeText(profile.fullName);
  const resumeName = normalizeText(resume.fullName);
  if (profileName && resumeName && resumeName !== profileName && !resumeName.includes(profileName) && !profileName.includes(resumeName)) {
    return 'generated full name does not match the master profile';
  }

  // Ground against raw resume text when available, fall back to schema fields
  const sourceText = rawResumeText.length > 200
    ? normalizeText(rawResumeText)
    : normalizeText([
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
  if (metric) return `generated resume includes a metric not present in the source: ${metric}`;

  return null;
}

// --- Edit-based prompt builder ---

function buildEditPrompt(
  rawResumeText: string,
  profile: typeof masterProfiles.$inferSelect,
  jdAnalysis: JdAnalysis,
  jobContext: any,
  profileSkills: string[],
  profileTools: string[],
  jdKeywords: string[],
  strict: boolean = false,
): string {
  const sourceText = normalizeText(rawResumeText);
  const supportedKeywords = jdKeywords.filter((kw) => sourceText.includes(normalizeText(kw)));
  const unsupportedKeywords = jdKeywords.filter((kw) => !sourceText.includes(normalizeText(kw)));

  const strictNote = strict
    ? '\nSTRICT MODE: Return the resume with ZERO invented content. If you are unsure about any fact, preserve the original wording verbatim.\n'
    : '';

  return `${MASTER_GENERATION_RULES}

========================
RESUME EDITOR INSTRUCTIONS
========================
You are a senior resume editor specialising in ATS optimisation. You will EDIT an existing resume to target a specific job. You do NOT generate a new resume — you surgically modify the original.
${strictNote}
EDITING RULES (read carefully):
1. Preserve every fact: company names, job titles, dates, degree names, institutions, metrics, technologies — copy verbatim from the original resume. Never invent, extrapolate, or paraphrase facts.
2. Minimum edits only: change as little as possible while maximising JD keyword coverage. If a bullet is already strong, leave it exactly as-is.
3. Summary/Headline: rewrite these two fields to target the role. Every other section change must be justified by a JD keyword match.
4. Skill reordering: move supported JD keywords to the front of skill lists. Do not add any skill not present in the original resume.
5. Bullet enhancement: for at most ONE bullet per role, lightly rephrase to embed a supported JD keyword — only if that keyword is already implicit in the bullet's meaning. Do not fabricate achievements.
6. Supported keywords (FROM original resume — you MAY use these): ${supportedKeywords.length ? supportedKeywords.join(', ') : 'none found'}
7. Unsupported keywords (NOT in original — NEVER add these): ${unsupportedKeywords.length ? unsupportedKeywords.join(', ') : 'none'}
8. If the original resume has a section (projects, certifications, etc.), include it. If it doesn't, omit it.

ORIGINAL RESUME (source of truth — preserve everything):
---
${rawResumeText}
---

TARGET JOB:
Title: ${jobContext.title}
Company: ${jobContext.company}
Location: ${jobContext.location || 'India'}
JD Context: ${jobContext.snippet || ''}

JD Analysis:
- Must-have skills: ${jdAnalysis.mustHaveSkills.join(', ')}
- Preferred skills: ${jdAnalysis.preferredSkills.join(', ')}
- ATS keywords: ${jdAnalysis.atsKeywords.join(', ')}
- Tool requirements: ${jdAnalysis.toolRequirements.join(', ')}
- Business context: ${jdAnalysis.businessContext}
- Hiring priorities: ${jdAnalysis.hiringPriorities}

CANDIDATE PROFILE (for contact details and structure reference):
Name: ${profile.fullName}
Headline: ${profile.headline}

OUTPUT RULES:
- Return a single JSON object. Do NOT wrap in markdown fences.
- fullName: copy exactly from original resume
- headline: rewrite for the target role (max 14 words)
- contact: copy all contact fields from the original resume exactly
- summary: 3-5 sentences, first sentence must naturally embed the top 2 must-have JD skills; grounded in the original summary's facts
- skillCategories: 4-7 JD-aligned categories; supported JD skills first; no skills absent from original
- experience: every role from original resume, same dates and companies; bullets edited minimally for JD keyword embedding
- projects: all projects from original resume if present
- education: copy verbatim from original
- certifications: copy verbatim from original

{
  "fullName": "...",
  "headline": "...",
  "contact": { "location": "...", "phone": "...", "email": "...", "linkedin": "...", "github": "...", "website": "..." },
  "summary": "...",
  "skillCategories": [{ "category": "...", "skills": ["..."] }],
  "experience": [{ "role": "...", "company": "...", "location": "...", "duration": "...", "bullets": ["..."] }],
  "projects": [{ "name": "...", "description": "...", "technologies": ["..."], "bullets": ["..."] }],
  "education": [{ "degree": "...", "institution": "...", "year": "...", "description": "..." }],
  "certifications": ["..."]
}`;
}

// --- Schema-based prompt builder (fallback when raw text is unavailable) ---

function buildSchemaPrompt(
  profile: typeof masterProfiles.$inferSelect,
  jdAnalysis: JdAnalysis,
  jobContext: any,
  profileSkills: string[],
  profileTools: string[],
  jdKeywords: string[],
): string {
  const expItems = sourceExperience(profile);
  const projectItems = sourceProjects(profile);
  const certItems = uniqueStrings(safeArray(profile.certifications), 10);
  const allDomains = uniqueStrings(safeArray(profile.domains), 20);

  return `${MASTER_GENERATION_RULES}

========================
RESUME WRITER INSTRUCTIONS
========================
You are a senior executive resume writer and ATS specialist. Produce a resume that scores ≥85% on ATS keyword coverage. Use ONLY facts from the candidate profile — never invent anything.

ABSOLUTE RULES:
- NEVER invent experience, metrics, technologies, or companies
- Every quantified metric MUST already appear in the master profile
- If a JD keyword is not supported by the profile, do NOT include it
- Preserve all employer names, job titles, dates, degree names, institutions exactly

CANDIDATE MASTER PROFILE:
Name: ${profile.fullName}
Headline: ${profile.headline}
Raw Summary: ${profile.rawSummary}

Experience:
${expItems.map((e) => `  - ${e.role} at ${e.company} (${e.duration})
    Summary: ${e.summary}
    Bullets: ${e.bullets.join(' | ')}`).join('\n')}

Skills: ${profileSkills.join(', ')}
Tools: ${profileTools.join(', ')}
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
JD Context: ${jobContext.snippet || ''}

JD Analysis:
- Must-have skills: ${jdAnalysis.mustHaveSkills.join(', ')}
- Preferred skills: ${jdAnalysis.preferredSkills.join(', ')}
- ATS keywords: ${jdAnalysis.atsKeywords.join(', ')}
- Tool requirements: ${jdAnalysis.toolRequirements.join(', ')}
- Business context: ${jdAnalysis.businessContext}
- Hiring priorities: ${jdAnalysis.hiringPriorities}

JD keywords supported by this profile (ONLY use these): ${jdKeywords.join(', ')}

OUTPUT: Return a single JSON object. Do NOT wrap in markdown fences.
{
  "fullName": "...", "headline": "...",
  "contact": { "location": "...", "phone": "...", "email": "...", "linkedin": "..." },
  "summary": "...",
  "skillCategories": [{ "category": "...", "skills": ["..."] }],
  "experience": [{ "role": "...", "company": "...", "location": "...", "duration": "...", "bullets": ["..."] }],
  "projects": [{ "name": "...", "description": "...", "technologies": ["..."], "bullets": ["..."] }],
  "education": [{ "degree": "...", "institution": "...", "year": "...", "description": "..." }],
  "certifications": ["..."]
}`;
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

  // Fetch raw resume text — the source of truth for the edit-based approach
  const uploadRow = db.select({ parsedText: uploadedResumes.parsedText })
    .from(uploadedResumes)
    .where(eq(uploadedResumes.profileId, profileId))
    .orderBy(desc(uploadedResumes.uploadedAt))
    .limit(1)
    .get();
  const rawResumeText = uploadRow?.parsedText?.trim() || '';
  const hasRawText = rawResumeText.length >= 200;

  const allSkills = uniqueStrings([
    ...safeArray(profile.skillsExplicit),
    ...safeArray(profile.skillsInferred),
  ], 60);
  const allTools = uniqueStrings(safeArray(profile.tools), 30);

  const jdKeywords = uniqueStrings([
    ...jdAnalysis.mustHaveSkills,
    ...jdAnalysis.atsKeywords,
    ...jdAnalysis.toolRequirements,
    ...jdAnalysis.preferredSkills,
  ], 40);

  const prompt = hasRawText
    ? buildEditPrompt(rawResumeText, profile, jdAnalysis, jobContext, allSkills, allTools, jdKeywords, false)
    : buildSchemaPrompt(profile, jdAnalysis, jobContext, allSkills, allTools, jdKeywords);

  const tryGenerate = async (temperature: number, strict: boolean): Promise<TailoredResume | null> => {
    const activePrompt = (hasRawText && strict)
      ? buildEditPrompt(rawResumeText, profile, jdAnalysis, jobContext, allSkills, allTools, jdKeywords, true)
      : prompt;

    const { data } = await generateDocumentJson(activePrompt, 'tailor_resume', {
      temperature,
      schema: TailoredResumeSchema,
    });

    const validated = TailoredResumeSchema.parse(data);
    const groundingIssue = findGroundingIssue(validated, profile, rawResumeText);
    if (groundingIssue) {
      console.warn(`[resume-tailor] Grounding check failed (temp=${temperature}): ${groundingIssue}`);
      return null;
    }
    return validated;
  };

  try {
    const result = await tryGenerate(0.2, false);
    if (result) return result;

    // Retry with temperature=0 and strict mode before falling back
    console.warn('[resume-tailor] First attempt failed grounding — retrying at temperature=0');
    const retryResult = await tryGenerate(0, true);
    if (retryResult) return retryResult;

    console.warn('[resume-tailor] Both attempts failed grounding — using deterministic fallback');
    return fallbackTailoredResume(profile, jdAnalysis, jobContext);
  } catch (error) {
    console.error(`[resume-tailor] AI generation failed — using fallback: ${safeDocumentAiErrorMessage(error)}`);
    return fallbackTailoredResume(profile, jdAnalysis, jobContext);
  }
}
