import { z } from 'zod';
import { getDb } from '../../../db';
import { masterProfiles } from '../../../db/schema';
import { and, eq } from 'drizzle-orm';
import { generateDocumentJson, JdAnalysis, safeDocumentAiErrorMessage } from './analysis';
import { resolveContext } from '@/lib/platform/identity';

export const OutreachNoteSchema = z.object({
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

function uniqueStrings(values: unknown[], limit = 12) {
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

function fallbackOutreachNote(profile: typeof masterProfiles.$inferSelect, jdAnalysis: JdAnalysis, jobContext: any) {
  const name = profile.fullName || 'I';
  const skills = supportedTerms(profile, jdAnalysis).slice(0, 2);
  const achievement = relevantAchievement(profile, skills, jobContext);
  const signal = achievement || (skills.length ? skills.join(' and ') : profile.headline || 'relevant experience');
  const conciseSignal = signal.length > 120 ? `${signal.slice(0, 117).trim()}...` : signal;
  return `Hello [Name], ${name} here. I noticed the ${jobContext.title} role at ${jobContext.company}; my background in ${conciseSignal} seems relevant to the priorities in the listing. Would you be open to a short conversation about the role?`;
}

function unsupportedMetric(rawOutputText: string, normalizedSourceText: string) {
  const metrics = rawOutputText.toLowerCase().match(/\b\d+(?:\.\d+)?\s*(?:%|percent|x|k|m|million|crore|lakh)\b/g) || [];
  return metrics.find((metric) => !normalizedSourceText.includes(normalizeText(metric)));
}

function findGroundingIssue(content: string, profile: typeof masterProfiles.$inferSelect, jdAnalysis: JdAnalysis, jobContext: any) {
  const outputText = normalizeText(content);
  const sourceText = profileSourceText(profile);
  const foreignMarkers = ['asha mehta', 'fintech cloud india', 'saasworks', 'john doe', 'jane doe', 'sample candidate'];
  if (foreignMarkers.some((marker) => outputText.includes(marker) && !sourceText.includes(marker))) {
    return 'outreach note contains a sample/foreign profile marker';
  }

  const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount > 90) return 'outreach note is too long for a practical LinkedIn message';

  const jobSignals = uniqueStrings([jobContext.company, jobContext.title, ...jdAnalysis.mustHaveSkills], 10)
    .map(normalizeText)
    .filter((term) => term.length > 2);
  if (!jobSignals.some((term) => outputText.includes(term))) {
    return 'outreach note does not reference the selected job';
  }

  const candidateSignals = uniqueStrings([
    profile.fullName,
    profile.headline,
    ...safeArray(profile.skillsExplicit),
    ...safeArray(profile.skillsInferred),
    ...safeArray(profile.tools),
    ...safeArray(profile.achievements),
  ], 30)
    .map(normalizeText)
    .filter((term) => term.length > 3);
  if (candidateSignals.length && !candidateSignals.some((term) => outputText.includes(term))) {
    return 'outreach note does not include selected profile evidence';
  }

  const metric = unsupportedMetric(content, sourceText);
  if (metric) return 'outreach note includes a metric not present in the selected profile';

  return null;
}

export async function generateOutreachNote(
  masterProfileId: number, 
  jdAnalysis: JdAnalysis, 
  jobContext: any
): Promise<string | null> {
  const db = getDb();
  const { profileId } = resolveContext();
  
  const profile = db.select().from(masterProfiles).where(and(eq(masterProfiles.id, masterProfileId), eq(masterProfiles.profileId, profileId))).get();
  if (!profile) throw new Error("Master profile not found or access denied");

  const prompt = `
    You are an expert career strategist.
    Write a short networking/outreach note for LinkedIn to a hiring manager or recruiter.

    RULES:
    1. Keep it extremely concise (under 75 words).
    2. Be warm, professional, and specific to the company or role.
    3. Reference exactly one highly relevant project or achievement from the candidate's profile that matches the hiring priorities.
    4. Include a soft call to action.
    5. Do not invent metrics, projects, employers, tools, or claims.
    6. Mention JD requirements only when they are supported by the candidate profile.
    
    Candidate Master Profile:
    Name: ${profile.fullName}
    Headline: ${profile.headline}
    Summary: ${profile.rawSummary}
    Skills: ${profile.skillsExplicit}
    Inferred Skills: ${profile.skillsInferred}
    Tools: ${profile.tools}
    Key Achievements: ${profile.achievements}
    Profile-supported JD overlap: ${supportedTerms(profile, jdAnalysis).join(', ') || 'No direct overlap detected'}

    Target Job Context:
    Title: ${jobContext.title}
    Company: ${jobContext.company}
    Selected JD Snippet: ${jobContext.snippet || 'No detailed description was available.'}
    Hiring Priorities: ${jdAnalysis.hiringPriorities}

    Return a STRICT JSON object matching this schema:
    {
      "content": "string (The full text of the networking note)"
    }
  `;

  try {
    const { data } = await generateDocumentJson(prompt, 'outreach', {
      temperature: 0.7,
      schema: OutreachNoteSchema,
    });
    const validated = OutreachNoteSchema.parse(data);
    const groundingIssue = findGroundingIssue(validated.content, profile, jdAnalysis, jobContext);
    if (groundingIssue) {
      console.warn(`AI outreach note failed grounding check; using deterministic fallback: ${groundingIssue}`);
      return fallbackOutreachNote(profile, jdAnalysis, jobContext);
    }
    
    return validated.content;
  } catch (error) {
    console.error(`Failed to generate outreach note with the selected AI provider; using deterministic fallback: ${safeDocumentAiErrorMessage(error)}`);
    return fallbackOutreachNote(profile, jdAnalysis, jobContext);
  }
}
