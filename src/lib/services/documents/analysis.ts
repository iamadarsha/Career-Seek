import { z } from 'zod';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getDb } from '../../../db';
import { jdAnalyses, scoredJobs, normalizedJobs } from '../../../db/schema';
import { eq, and } from 'drizzle-orm';
import { resolveContext } from '@/lib/platform/identity';
import { getAppConfig } from '../../config';
import { generateWithFallback } from '../gemini';

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
      mustHaveSkills: JSON.parse(existing.mustHaveSkills || '[]'),
      preferredSkills: JSON.parse(existing.preferredSkills || '[]'),
      atsKeywords: JSON.parse(existing.atsKeywords || '[]'),
      domainLanguage: JSON.parse(existing.domainLanguage || '[]'),
      senioritySignals: JSON.parse(existing.senioritySignals || '[]'),
      leadershipSignals: JSON.parse(existing.leadershipSignals || '[]'),
      toolRequirements: JSON.parse(existing.toolRequirements || '[]'),
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

  const config = getAppConfig();
  if (!config.geminiApiKey) {
    throw new Error('No Gemini API key configured.');
  }

  const genAI = new GoogleGenerativeAI(config.geminiApiKey);

  const prompt = `
    Analyze the following Job Description to extract structured signals for resume tailoring and interview prep.
    Focus on extracting precise, atomic terms where lists are expected.

    Job Title: ${job.normalized_jobs.title}
    Company: ${job.normalized_jobs.company}
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
    const responseText = await generateWithFallback(genAI, prompt, {
      temperature: 0.1,
      responseMimeType: "application/json",
    }, 'jd_analysis');

    const parsedData = JSON.parse(responseText);
    const validated = JdAnalysisSchema.parse(parsedData);

    // Persist
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

    return validated;
  } catch (error) {
    console.error("Failed to analyze JD:", error);
    return null;
  }
}
