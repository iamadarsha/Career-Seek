import { z } from 'zod';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getDb } from '../../../db';
import { masterProfiles } from '../../../db/schema';
import { eq, and } from 'drizzle-orm';
import { resolveContext } from '@/lib/platform/identity';
import { getAppConfig } from '../../config';
import { generateWithFallback } from '../gemini';
import { JdAnalysis } from './analysis';

export const CoverLetterSchema = z.object({
  content: z.string(),
});

export async function generateCoverLetter(
  masterProfileId: number, 
  jdAnalysis: JdAnalysis, 
  jobContext: any
): Promise<string | null> {
  const db = getDb();
  const { profileId } = resolveContext();
  
  const profile = db.select().from(masterProfiles).where(and(eq(masterProfiles.id, masterProfileId), eq(masterProfiles.profileId, profileId))).get();
  if (!profile) throw new Error("Master profile not found or access denied");

  const config = getAppConfig();
  if (!config.geminiApiKey) throw new Error("No Gemini API key configured.");

  const genAI = new GoogleGenerativeAI(config.geminiApiKey);

  const prompt = `
    You are an expert executive cover letter writer.
    Write a highly tailored, compelling cover letter for the candidate based on the job description.

    RULES:
    1. Do not use generic template phrasing like "I am writing to express my interest in...". Start with a strong, role-specific hook.
    2. Write in the candidate's voice: professional, confident, and achievement-led.
    3. Frame the candidate's experience against the company's business context and hiring priorities.
    4. Keep it concise (3-4 paragraphs max).
    5. Do not invent experience.
    
    Candidate Master Profile:
    Name: ${profile.fullName}
    Headline: ${profile.headline}
    Experience Summary: ${profile.rawSummary}
    Key Achievements: ${profile.achievements}

    Target Job Context:
    Title: ${jobContext.title}
    Company: ${jobContext.company}
    Business Context: ${jdAnalysis.businessContext}
    Hiring Priorities: ${jdAnalysis.hiringPriorities}
    Must-have Skills: ${jdAnalysis.mustHaveSkills.join(', ')}

    Return a STRICT JSON object matching this schema:
    {
      "content": "string (The full text of the cover letter with proper paragraph breaks)"
    }
  `;

  try {
    const responseText = await generateWithFallback(genAI, prompt, {
      temperature: 0.7,
      responseMimeType: "application/json",
    }, 'cover_letter');

    const parsedData = JSON.parse(responseText);
    const validated = CoverLetterSchema.parse(parsedData);
    
    return validated.content;
  } catch (error) {
    console.error("Failed to generate cover letter:", error);
    return null;
  }
}
