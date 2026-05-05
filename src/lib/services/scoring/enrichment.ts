import { getAIManager } from '../../ai/manager';
import { discoverAIProviderConfigs } from '../../ai/providers';
import { getAIRuntimeEnv, getAppConfig } from '../../config';
import { getDb } from '../../../db';
import { jobEnrichments } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { scoreJob } from './engine';
import { z } from 'zod';

export interface AIJobBrief {
  fitSummary: string;
  pros: string[];
  cons: string[];
  interviewAngle: string;
  salaryEstimate: string;
  resumeFocus: string;
}

const AIJobBriefSchema = z.object({
  fitSummary: z.string(),
  pros: z.array(z.string()).default([]),
  cons: z.array(z.string()).default([]),
  interviewAngle: z.string(),
  salaryEstimate: z.string(),
  resumeFocus: z.string(),
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

function profileSourceText(masterProfile: any) {
  return normalizeText([
    masterProfile.headline,
    masterProfile.rawSummary,
    masterProfile.skillsExplicit,
    masterProfile.skillsInferred,
    masterProfile.tools,
    masterProfile.experience,
    masterProfile.projects,
    masterProfile.achievements,
  ].filter(Boolean).join(' '));
}

function supportedProfileTerms(masterProfile: any) {
  return uniqueStrings([
    ...safeArray(masterProfile.skillsExplicit),
    ...safeArray(masterProfile.skillsInferred),
    ...safeArray(masterProfile.tools),
  ], 32);
}

function buildLocalBrief(normalizedJob: any, masterProfile: any, searchProfile: any): AIJobBrief {
  const breakdown = scoreJob(normalizedJob, masterProfile, searchProfile);
  const supportedTerms = supportedProfileTerms(masterProfile);
  const fitLabel =
    breakdown.totalScore >= 75 ? 'strong' :
    breakdown.totalScore >= 55 ? 'reasonable' :
    breakdown.totalScore >= 35 ? 'mixed' :
    'weak';

  return {
    fitSummary: `Based on the uploaded profile, this looks like a ${fitLabel} fit for ${normalizedJob.title} at ${normalizedJob.company}. The strongest signals come from ${breakdown.positiveFactors.slice(0, 2).join(' and ') || 'basic title alignment'}, while the main risks are ${breakdown.negativeFactors.slice(0, 2).join(' and ') || 'limited verified overlap in the listing text'}.`,
    pros: breakdown.positiveFactors.slice(0, 3).length
      ? breakdown.positiveFactors.slice(0, 3)
      : [`Profile shows relevant experience for ${normalizedJob.title}.`],
    cons: [...breakdown.negativeFactors, ...breakdown.warnings].slice(0, 3).length
      ? [...breakdown.negativeFactors, ...breakdown.warnings].slice(0, 3)
      : ['Verify the full job description before applying.'],
    interviewAngle: supportedTerms.length
      ? `Emphasize confirmed strengths such as ${supportedTerms.slice(0, 4).join(', ')} and tie them directly to this role's day-to-day work.`
      : 'Emphasize the most concrete, profile-backed achievements and keep claims tightly tied to the uploaded resume.',
    salaryEstimate: normalizedJob.salaryRaw
      ? `The listing already shows salary context: ${normalizedJob.salaryRaw}. Compare it against your target before applying.`
      : 'Salary is not listed, so benchmark this role against similar openings in the same city and seniority band.',
    resumeFocus: supportedTerms.length
      ? `Lead with verified strengths such as ${supportedTerms.slice(0, 6).join(', ')}, and avoid adding unsupported tools or responsibilities.`
      : 'Keep the resume tightly grounded in the uploaded profile and only emphasize experience that is already documented there.',
  };
}

function findGroundingIssue(brief: AIJobBrief, masterProfile: any) {
  const profileText = profileSourceText(masterProfile);
  const supportedTerms = supportedProfileTerms(masterProfile);
  const missingClaimText = [brief.fitSummary, ...brief.cons].join(' ');
  const normalizedMissingClaims = normalizeText(missingClaimText);
  const signalsMissingSkill = /\b(lack|lacks|lacking|missing|without|does not have|doesn't have)\b/.test(normalizedMissingClaims);

  if (!signalsMissingSkill) return null;

  const conflictingSupportedTerm = supportedTerms.find((term) => {
    const normalized = normalizeText(term);
    return normalized && normalizedMissingClaims.includes(normalized) && profileText.includes(normalized);
  });

  return conflictingSupportedTerm ? `brief marks supported profile evidence as missing (${conflictingSupportedTerm})` : null;
}

function hasExplicitAIProvider(env: Record<string, string | undefined>, config: ReturnType<typeof getAppConfig>) {
  const providers = discoverAIProviderConfigs(env);
  return providers.some((provider) => {
    if (!provider.enabled) return false;
    if (provider.requiresApiKey) return Boolean(provider.apiKey?.trim());
    if (provider.provider === 'ollama') {
      return config.aiProvider === 'ollama' || env.CAREER_SEEK_ENABLE_OLLAMA === '1' || Boolean(env.OLLAMA_BASE_URL?.trim());
    }
    return Boolean(provider.baseUrl?.trim());
  });
}

function parseBriefPayload(payload: unknown): AIJobBrief {
  const parsed = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  return {
    fitSummary: String(parsed.fitSummary || ''),
    pros: Array.isArray(parsed.pros) ? parsed.pros.map(String).filter(Boolean).slice(0, 3) : [],
    cons: Array.isArray(parsed.cons) ? parsed.cons.map(String).filter(Boolean).slice(0, 3) : [],
    interviewAngle: String(parsed.interviewAngle || ''),
    salaryEstimate: String(parsed.salaryEstimate || ''),
    resumeFocus: String(parsed.resumeFocus || ''),
  };
}

export async function generateJobBrief(scoredJobId: number, normalizedJob: any, masterProfile: any, searchProfile: any): Promise<AIJobBrief | null> {
  const db = getDb();

  // Check cache
  const existing = db.select().from(jobEnrichments).where(eq(jobEnrichments.scoredJobId, scoredJobId)).get();
  if (existing) {
    return {
      fitSummary: existing.fitSummary || '',
      pros: JSON.parse(existing.pros || '[]'),
      cons: JSON.parse(existing.cons || '[]'),
      interviewAngle: existing.interviewAngle || '',
      salaryEstimate: existing.salaryEstimate || '',
      resumeFocus: existing.resumeFocus || ''
    };
  }

  const config = getAppConfig();
  const env = getAIRuntimeEnv(config);
  if (!hasExplicitAIProvider(env, config)) {
    return buildLocalBrief(normalizedJob, masterProfile, searchProfile);
  }

  const prompt = `
  Candidate Profile:
  Name: ${masterProfile.fullName || 'Candidate'}
  Title: ${masterProfile.headline || masterProfile.title}
  Experience: ${masterProfile.yearsOfExperience} years
  Skills: ${masterProfile.skillsExplicit}
  Inferred Skills: ${masterProfile.skillsInferred}
  Tools: ${masterProfile.tools}
  Summary: ${masterProfile.rawSummary}
  Experience JSON: ${masterProfile.experience}
  Projects JSON: ${masterProfile.projects}

  Job Details:
  Title: ${normalizedJob.title}
  Company: ${normalizedJob.company}
  Snippet/Description: ${normalizedJob.snippet}
  Salary: ${normalizedJob.salaryRaw}

  Provide a highly professional fit brief in strict JSON format:
  {
    "fitSummary": "A 2-3 sentence summary of why this is or isn't a good fit.",
    "pros": ["string - top 3 reasons to apply"],
    "cons": ["string - top 1-2 watch-outs or missing skills"],
    "interviewAngle": "A 1-sentence suggestion on what to emphasize in an interview.",
    "salaryEstimate": "A 1-sentence note on salary if missing, or evaluating if provided.",
    "resumeFocus": "A 1-sentence suggestion on how to tweak the resume for this role."
  }
  `;

  try {
    const response = await getAIManager({ env }).generate<Record<string, unknown>>({
      provider: config.aiProvider,
      model: config.aiModel,
      systemPrompt: [
        'You are an expert career advisor.',
        'Analyze fit between a candidate profile and a job.',
        'Ground every claim strictly in the candidate profile.',
        'Never say the candidate lacks a skill if that skill appears anywhere in the profile data.',
        'Every weakness must point to a requirement absent from the profile or clearly mismatched in seniority/domain.',
      ].join(' '),
      userPrompt: prompt,
      temperature: 0.3,
      maxTokens: 900,
      responseFormat: { type: 'json', schema: AIJobBriefSchema },
      metadata: {
        task: 'job_fit_brief',
        scoredJobId,
      },
    });
    const brief = parseBriefPayload(response.parsed);
    const groundingIssue = findGroundingIssue(brief, masterProfile);
    if (groundingIssue) {
      console.warn(`AI job brief failed grounding check; using deterministic fallback: ${groundingIssue}`);
      return buildLocalBrief(normalizedJob, masterProfile, searchProfile);
    }

    // Save to DB
    db.insert(jobEnrichments).values({
      scoredJobId: scoredJobId,
      fitSummary: brief.fitSummary,
      pros: JSON.stringify(brief.pros || []),
      cons: JSON.stringify(brief.cons || []),
      interviewAngle: brief.interviewAngle,
      salaryEstimate: brief.salaryEstimate,
      resumeFocus: brief.resumeFocus,
      enrichedAt: new Date(),
    }).run();

    return brief;
  } catch (error) {
    console.error('Failed to enrich job:', error);
    return buildLocalBrief(normalizedJob, masterProfile, searchProfile);
  }
}
