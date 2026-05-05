import { z } from 'zod';
import { getDb } from '../../../db';
import { masterProfiles } from '../../../db/schema';
import { eq, and } from 'drizzle-orm';
import { resolveContext } from '@/lib/platform/identity';
import { generateDocumentJson, JdAnalysis, safeDocumentAiErrorMessage } from './analysis';

export const CoverLetterSchema = z.object({
  content: z.string(),
});

function safeArray(value: unknown) {
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

function uniqueStrings(values: unknown[], limit = 16) {
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
    JSON.stringify(safeArray(profile.achievements)),
  ].filter(Boolean).join(' '));
}

function supportedTerms(profile: typeof masterProfiles.$inferSelect, jdAnalysis: JdAnalysis) {
  const sourceText = profileSourceText(profile);
  return uniqueStrings([...jdAnalysis.mustHaveSkills, ...jdAnalysis.atsKeywords, ...jdAnalysis.toolRequirements])
    .filter((term) => {
      const normalized = normalizeText(term);
      return normalized.length <= 2
        ? new RegExp(`\\b${normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(sourceText)
        : sourceText.includes(normalized);
    });
}

function scoreTextAgainstTerms(value: string, terms: string[]) {
  const text = normalizeText(value);
  return terms.reduce((score, term) => score + (text.includes(normalizeText(term)) ? 1 : 0), 0);
}

function relevantAchievement(profile: typeof masterProfiles.$inferSelect, terms: string[], jobContext: any) {
  const jobTerms = uniqueStrings([
    ...terms,
    jobContext.title,
    jobContext.company,
    jobContext.snippet,
  ].join(' ').split(/[^a-z0-9+#.]+/i), 40);
  return uniqueStrings(safeArray(profile.achievements), 6)
    .map((achievement) => ({
      achievement,
      score: scoreTextAgainstTerms(achievement, jobTerms),
    }))
    .sort((a, b) => b.score - a.score)[0]?.achievement || '';
}

function conciseSummary(profile: typeof masterProfiles.$inferSelect) {
  const summary = String(profile.rawSummary || profile.headline || 'my professional background').replace(/\s+/g, ' ').trim();
  return summary.length > 260 ? `${summary.slice(0, 257).trim()}...` : summary;
}

function unsupportedMetric(rawOutputText: string, normalizedSourceText: string) {
  const metrics = rawOutputText.toLowerCase().match(/\b\d+(?:\.\d+)?\s*(?:%|percent|x|k|m|million|crore|lakh)\b/g) || [];
  return metrics.find((metric) => !normalizedSourceText.includes(normalizeText(metric)));
}

function fallbackCoverLetter(profile: typeof masterProfiles.$inferSelect, jdAnalysis: JdAnalysis, jobContext: any) {
  const name = profile.fullName || '';
  const skills = supportedTerms(profile, jdAnalysis).slice(0, 5);
  const achievement = relevantAchievement(profile, skills, jobContext);
  const summary = conciseSummary(profile);
  const focus = skills.length
    ? `The clearest overlap for this role is ${skills.join(', ')}, and I can connect those strengths to ${jobContext.company}'s stated priorities.`
    : `The listing has limited profile-supported keyword overlap, so I would focus the conversation on the most concrete experience in my background and verify the role requirements before applying.`;
  const achievementSentence = achievement ? `One proof point I would highlight is ${achievement}` : '';
  const signature = name ? `\n\nSincerely,\n${name}` : '';

  return `Dear ${jobContext.company} Hiring Team,\n\nThe ${jobContext.title} role stands out because it connects directly to ${summary}.\n\n${focus} ${achievementSentence}\n\nI would welcome the opportunity to discuss how this background can support ${jobContext.company}'s current hiring priorities${jdAnalysis.hiringPriorities ? `: ${jdAnalysis.hiringPriorities}` : '.'}${signature}`;
}

function findGroundingIssue(content: string, profile: typeof masterProfiles.$inferSelect, jdAnalysis: JdAnalysis, jobContext: any) {
  const outputText = normalizeText(content);
  const sourceText = profileSourceText(profile);
  const foreignMarkers = ['asha mehta', 'fintech cloud india', 'saasworks', 'john doe', 'jane doe', 'sample candidate'];
  if (foreignMarkers.some((marker) => outputText.includes(marker) && !sourceText.includes(marker))) {
    return 'cover letter contains a sample/foreign profile marker';
  }

  const jobSignals = uniqueStrings([jobContext.company, jobContext.title, ...jdAnalysis.mustHaveSkills], 10)
    .map(normalizeText)
    .filter((term) => term.length > 2);
  if (!jobSignals.some((term) => outputText.includes(term))) {
    return 'cover letter does not reference the selected job';
  }

  const candidateSignals = uniqueStrings([
    profile.fullName,
    profile.headline,
    ...safeArray(profile.skillsExplicit),
    ...safeArray(profile.skillsInferred),
    ...safeArray(profile.tools),
    ...safeArray(profile.domains),
    ...safeArray(profile.achievements),
  ], 30)
    .map(normalizeText)
    .filter((term) => term.length > 3);
  if (candidateSignals.length && !candidateSignals.some((term) => outputText.includes(term))) {
    return 'cover letter does not include any selected profile signals';
  }

  const metric = unsupportedMetric(content, sourceText);
  if (metric) return 'cover letter includes a metric not present in the selected profile';

  return null;
}

export async function generateCoverLetter(
  masterProfileId: number, 
  jdAnalysis: JdAnalysis, 
  jobContext: any
): Promise<string | null> {
  const db = getDb();
  const { profileId } = resolveContext();
  
  const profile = db.select().from(masterProfiles).where(and(eq(masterProfiles.id, masterProfileId), eq(masterProfiles.profileId, profileId))).get();
  if (!profile) throw new Error("Master profile not found or access denied");

  const prompt = `
    You are an expert executive cover letter writer.
    Write a highly tailored, compelling cover letter for the candidate based on the job description.

    RULES:
    1. Do not use generic template phrasing like "I am writing to express my interest in...". Start with a strong, role-specific hook.
    2. Write in the candidate's voice: professional, confident, and achievement-led.
    3. Frame the candidate's experience against the company's business context and hiring priorities.
    4. Keep it concise (3-4 paragraphs max).
    5. Do not invent experience.
    6. Do not invent or round metrics, employers, titles, tools, or achievements.
    7. Mention JD requirements only where the candidate profile supports them.
    8. Include the target company and role in the opening paragraph.
    9. If the job description is thin or generic, be honest and specific rather than using broad praise.
    
    Candidate Master Profile:
    Name: ${profile.fullName}
    Headline: ${profile.headline}
    Experience Summary: ${profile.rawSummary}
    Experience: ${profile.experience}
    Explicit Skills: ${profile.skillsExplicit}
    Inferred Skills: ${profile.skillsInferred}
    Tools: ${profile.tools}
    Domains: ${profile.domains}
    Key Achievements: ${profile.achievements}
    Profile-supported JD overlap: ${supportedTerms(profile, jdAnalysis).join(', ') || 'No direct overlap detected'}

    Target Job Context:
    Title: ${jobContext.title}
    Company: ${jobContext.company}
    Location: ${jobContext.location || 'Not specified'}
    Employment Type: ${jobContext.employmentType || 'Not specified'}
    Selected JD Snippet: ${jobContext.snippet || 'No detailed description was available.'}
    Business Context: ${jdAnalysis.businessContext}
    Hiring Priorities: ${jdAnalysis.hiringPriorities}
    Must-have Skills: ${jdAnalysis.mustHaveSkills.join(', ')}

    Return a STRICT JSON object matching this schema:
    {
      "content": "string (The full text of the cover letter with proper paragraph breaks)"
    }
  `;

  try {
    const { data } = await generateDocumentJson(prompt, 'cover_letter', {
      temperature: 0.7,
      schema: CoverLetterSchema,
    });
    const validated = CoverLetterSchema.parse(data);
    const groundingIssue = findGroundingIssue(validated.content, profile, jdAnalysis, jobContext);
    if (groundingIssue) {
      console.warn(`AI cover letter failed grounding check; using deterministic fallback: ${groundingIssue}`);
      return fallbackCoverLetter(profile, jdAnalysis, jobContext);
    }
    
    return validated.content;
  } catch (error) {
    console.error(`Failed to generate cover letter with the selected AI provider; using deterministic fallback: ${safeDocumentAiErrorMessage(error)}`);
    return fallbackCoverLetter(profile, jdAnalysis, jobContext);
  }
}
