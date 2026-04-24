import { z } from 'zod';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getDb } from '../../../db';
import { masterProfiles } from '../../../db/schema';
import { eq, and } from 'drizzle-orm';
import { resolveContext } from '@/lib/platform/identity';
import { getAppConfig } from '../../config';
import { generateWithFallback } from '../gemini';
import { JdAnalysis } from './analysis';

export const TailoredResumeSchema = z.object({
  fullName: z.string(),
  headline: z.string(),
  summary: z.string(),
  skills: z.array(z.string()),
  tools: z.array(z.string()),
  experience: z.array(z.object({
    role: z.string(),
    company: z.string(),
    duration: z.string(),
    bullets: z.array(z.string()),
  })),
  education: z.array(z.object({
    degree: z.string(),
    institution: z.string(),
    year: z.string(),
  })),
});

export type TailoredResume = z.infer<typeof TailoredResumeSchema>;

export async function tailorResume(
  masterProfileId: number, 
  jdAnalysis: JdAnalysis, 
  jobContext: any
): Promise<TailoredResume | null> {
  const db = getDb();
  const { profileId } = resolveContext();
  
  const profile = db.select().from(masterProfiles).where(and(eq(masterProfiles.id, masterProfileId), eq(masterProfiles.profileId, profileId))).get();
  if (!profile) throw new Error("Master profile not found or access denied");

  const config = getAppConfig();
  if (!config.geminiApiKey) throw new Error("No Gemini API key configured.");

  const genAI = new GoogleGenerativeAI(config.geminiApiKey);

  const prompt = `
    You are an expert executive resume writer. 
    Your task is to tailor a candidate's master profile for a specific job description.

    RULES:
    1. NEVER invent experience, skills, or metrics that do not exist in the master profile.
    2. Rewrite experience bullets to emphasize achievements and skills relevant to the JD. Focus on quantified results if they exist.
    3. Order the skills list so that skills matching the JD are first.
    4. Write a compelling, role-specific summary (3-4 lines).
    5. Write a role-specific headline that bridges the candidate's background to the target role.
    
    Candidate Master Profile:
    Name: ${profile.fullName}
    Headline: ${profile.headline}
    Experience: ${profile.experience}
    Skills: ${profile.skillsExplicit}
    Tools: ${profile.tools}
    Education: ${profile.education}
    Achievements: ${profile.achievements}

    Target Job Context:
    Title: ${jobContext.title}
    Company: ${jobContext.company}
    Must-have Skills: ${jdAnalysis.mustHaveSkills.join(', ')}
    ATS Keywords: ${jdAnalysis.atsKeywords.join(', ')}
    Business Context: ${jdAnalysis.businessContext}
    Hiring Priorities: ${jdAnalysis.hiringPriorities}

    Return a STRICT JSON object matching this schema:
    {
      "fullName": "string",
      "headline": "string",
      "summary": "string",
      "skills": ["string"],
      "tools": ["string"],
      "experience": [
        {
          "role": "string",
          "company": "string",
          "duration": "string",
          "bullets": ["string"]
        }
      ],
      "education": [
        {
          "degree": "string",
          "institution": "string",
          "year": "string"
        }
      ]
    }
  `;

  try {
    const responseText = await generateWithFallback(genAI, prompt, {
      temperature: 0.3,
      responseMimeType: "application/json",
    }, 'tailor_resume');

    const parsedData = JSON.parse(responseText);
    const validated = TailoredResumeSchema.parse(parsedData);
    
    return validated;
  } catch (error) {
    console.error("Failed to tailor resume:", error);
    return null;
  }
}
