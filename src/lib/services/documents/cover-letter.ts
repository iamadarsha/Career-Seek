import { z } from 'zod';
import { getDb } from '../../../db';
import { masterProfiles, uploadedResumes } from '../../../db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { resolveContext } from '@/lib/platform/identity';
import { generateDocumentJson, JdAnalysis, safeDocumentAiErrorMessage } from './analysis';
import { COVER_LETTER_RULES } from './generation-rules';

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

function profileSourceText(profile: typeof masterProfiles.$inferSelect, rawResumeText: string) {
  if (rawResumeText.length > 200) return normalizeText(rawResumeText);
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

function supportedTerms(profile: typeof masterProfiles.$inferSelect, jdAnalysis: JdAnalysis, rawResumeText: string) {
  const sourceText = profileSourceText(profile, rawResumeText);
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
  const skills = supportedTerms(profile, jdAnalysis, '').slice(0, 5);
  const achievement = relevantAchievement(profile, skills, jobContext);
  const summary = conciseSummary(profile);
  const focus = skills.length
    ? `The clearest overlap for this role is ${skills.join(', ')}, and I can connect those strengths to ${jobContext.company}'s stated priorities.`
    : `The listing has limited profile-supported keyword overlap, so I would focus the conversation on the most concrete experience in my background and verify the role requirements before applying.`;
  const achievementSentence = achievement ? `One proof point I would highlight is ${achievement}` : '';
  const signature = name ? `\n\nSincerely,\n${name}` : '';

  return `Dear ${jobContext.company} Hiring Team,\n\nThe ${jobContext.title} role stands out because it connects directly to ${summary}.\n\n${focus} ${achievementSentence}\n\nI would welcome the opportunity to discuss how this background can support ${jobContext.company}'s current hiring priorities${jdAnalysis.hiringPriorities ? `: ${jdAnalysis.hiringPriorities}` : '.'}${signature}`;
}

function findGroundingIssue(
  content: string,
  profile: typeof masterProfiles.$inferSelect,
  jdAnalysis: JdAnalysis,
  jobContext: any,
  rawResumeText: string,
) {
  const outputText = normalizeText(content);
  const sourceText = profileSourceText(profile, rawResumeText);

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
    return 'cover letter does not include any candidate profile signals';
  }

  const metric = unsupportedMetric(content, sourceText);
  if (metric) return `cover letter includes a metric not present in the source: ${metric}`;

  return null;
}

function buildCoverLetterPrompt(
  profile: typeof masterProfiles.$inferSelect,
  jdAnalysis: JdAnalysis,
  jobContext: any,
  rawResumeText: string,
  strict: boolean = false,
): string {
  const terms = supportedTerms(profile, jdAnalysis, rawResumeText);
  const strictNote = strict
    ? '\nSTRICT MODE: Every claim must be directly traceable to the source material below. If you are unsure about any fact, omit it rather than guessing.\n'
    : '';

  const sourceBlock = rawResumeText.length > 200
    ? `FULL RESUME / CV (primary source of truth — use this for all facts):
---
${rawResumeText}
---`
    : `CANDIDATE PROFILE (source of truth):
Name: ${profile.fullName}
Headline: ${profile.headline}
Summary: ${profile.rawSummary}
Experience: ${JSON.stringify(safeArray(profile.experience))}
Skills: ${[...safeArray(profile.skillsExplicit), ...safeArray(profile.skillsInferred)].join(', ')}
Tools: ${safeArray(profile.tools).join(', ')}
Domains: ${safeArray(profile.domains).join(', ')}
Achievements: ${safeArray(profile.achievements).join(' | ')}`;

  return `${COVER_LETTER_RULES}
${strictNote}
========================
COVER LETTER TASK
========================

${sourceBlock}

TARGET JOB:
Title: ${jobContext.title}
Company: ${jobContext.company}
Location: ${jobContext.location || 'Not specified'}
Employment Type: ${jobContext.employmentType || 'Not specified'}
JD Snippet: ${jobContext.snippet || 'No detailed description was available.'}
Business Context: ${jdAnalysis.businessContext}
Hiring Priorities: ${jdAnalysis.hiringPriorities}
Must-have Skills: ${jdAnalysis.mustHaveSkills.join(', ')}
Preferred Skills: ${jdAnalysis.preferredSkills.join(', ')}

Profile-supported JD keywords (ONLY mention these skills/tools — do not invent others):
${terms.length ? terms.join(', ') : 'No direct keyword overlap detected — focus on transferable experience.'}

OUTPUT: Return a STRICT JSON object. Do NOT wrap in markdown fences.
{
  "content": "string (full cover letter text with paragraph breaks using \\n\\n)"
}`;
}

export async function generateCoverLetter(
  masterProfileId: number,
  jdAnalysis: JdAnalysis,
  jobContext: any,
): Promise<string | null> {
  const db = getDb();
  const { profileId } = resolveContext();

  const profile = db.select().from(masterProfiles)
    .where(and(eq(masterProfiles.id, masterProfileId), eq(masterProfiles.profileId, profileId)))
    .get();
  if (!profile) throw new Error('Master profile not found or access denied');

  // Fetch raw resume text — primary source of truth for grounding
  const uploadRow = db.select({ parsedText: uploadedResumes.parsedText })
    .from(uploadedResumes)
    .where(eq(uploadedResumes.profileId, profileId))
    .orderBy(desc(uploadedResumes.uploadedAt))
    .limit(1)
    .get();
  const rawResumeText = uploadRow?.parsedText?.trim() || '';

  const tryGenerate = async (temperature: number, strict: boolean): Promise<string | null> => {
    const prompt = buildCoverLetterPrompt(profile, jdAnalysis, jobContext, rawResumeText, strict);
    const { data } = await generateDocumentJson(prompt, 'cover_letter', {
      temperature,
      schema: CoverLetterSchema,
    });
    const validated = CoverLetterSchema.parse(data);
    const groundingIssue = findGroundingIssue(validated.content, profile, jdAnalysis, jobContext, rawResumeText);
    if (groundingIssue) {
      console.warn(`[cover-letter] Grounding check failed (temp=${temperature}): ${groundingIssue}`);
      return null;
    }
    return validated.content;
  };

  try {
    const result = await tryGenerate(0.7, false);
    if (result) return result;

    // Retry with lower temperature and strict mode
    console.warn('[cover-letter] First attempt failed grounding — retrying at temperature=0.4 strict');
    const retryResult = await tryGenerate(0.4, true);
    if (retryResult) return retryResult;

    console.warn('[cover-letter] Both attempts failed grounding — using deterministic fallback');
    return fallbackCoverLetter(profile, jdAnalysis, jobContext);
  } catch (error) {
    console.error(`[cover-letter] AI generation failed — using deterministic fallback: ${safeDocumentAiErrorMessage(error)}`);
    return fallbackCoverLetter(profile, jdAnalysis, jobContext);
  }
}
