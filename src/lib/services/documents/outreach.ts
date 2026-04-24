import { z } from 'zod';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getDb } from '../../../db';
import { masterProfiles } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { getAppConfig } from '../../config';
import { generateWithFallback } from '../gemini';
import { JdAnalysis } from './analysis';

export const OutreachNoteSchema = z.object({
  content: z.string(),
});

export async function generateOutreachNote(
  masterProfileId: number, 
  jdAnalysis: JdAnalysis, 
  jobContext: any
): Promise<string | null> {
  const db = getDb();
  
  const profile = db.select().from(masterProfiles).where(eq(masterProfiles.id, masterProfileId)).get();
  if (!profile) throw new Error("Master profile not found");

  const config = getAppConfig();
  if (!config.geminiApiKey) throw new Error("No Gemini API key configured.");

  const genAI = new GoogleGenerativeAI(config.geminiApiKey);

  const prompt = `
    You are an expert career strategist.
    Write a short networking/outreach note for LinkedIn to a hiring manager or recruiter.

    RULES:
    1. Keep it extremely concise (under 75 words).
    2. Be warm, professional, and specific to the company or role.
    3. Reference exactly one highly relevant project or achievement from the candidate's profile that matches the hiring priorities.
    4. Include a soft call to action.
    
    Candidate Master Profile:
    Name: ${profile.fullName}
    Key Achievements: ${profile.achievements}

    Target Job Context:
    Title: ${jobContext.title}
    Company: ${jobContext.company}
    Hiring Priorities: ${jdAnalysis.hiringPriorities}

    Return a STRICT JSON object matching this schema:
    {
      "content": "string (The full text of the networking note)"
    }
  `;

  try {
    const responseText = await generateWithFallback(genAI, prompt, {
      temperature: 0.7,
      responseMimeType: "application/json",
    }, 'outreach');

    const parsedData = JSON.parse(responseText);
    const validated = OutreachNoteSchema.parse(parsedData);
    
    return validated.content;
  } catch (error) {
    console.error("Failed to generate outreach note:", error);
    return null;
  }
}
