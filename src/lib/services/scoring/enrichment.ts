import { GoogleGenerativeAI } from '@google/generative-ai';
import { generateWithFallback } from '../gemini';
import { getAppConfig } from '../../config';
import { getDb } from '../../../db';
import { jobEnrichments } from '../../../db/schema';
import { eq } from 'drizzle-orm';

export interface AIJobBrief {
  fitSummary: string;
  pros: string[];
  cons: string[];
  interviewAngle: string;
  salaryEstimate: string;
  resumeFocus: string;
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
  if (!config.geminiApiKey) {
    console.error("No Gemini API key configured.");
    return null;
  }

  const genAI = new GoogleGenerativeAI(config.geminiApiKey);
  const genConfig = {
    temperature: 0.3,
    responseMimeType: "application/json",
  };

  const prompt = `
  You are an expert career advisor.
  Analyze the fit between this Candidate and this Job.
  
  Candidate Profile:
  Title: ${masterProfile.headline || masterProfile.title}
  Experience: ${masterProfile.yearsOfExperience} years
  Skills: ${masterProfile.skillsExplicit}
  
  Job Details:
  Title: ${normalizedJob.title}
  Company: ${normalizedJob.company}
  Snippet/Description: ${normalizedJob.snippet}
  Salary: ${normalizedJob.salaryRaw}
  
  Provide a highly professional brief in strict JSON format:
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
    const responseText = await generateWithFallback(genAI, prompt, genConfig);
    const parsed = JSON.parse(responseText);
    
    // Save to DB
    db.insert(jobEnrichments).values({
      scoredJobId: scoredJobId,
      fitSummary: parsed.fitSummary,
      pros: JSON.stringify(parsed.pros || []),
      cons: JSON.stringify(parsed.cons || []),
      interviewAngle: parsed.interviewAngle,
      salaryEstimate: parsed.salaryEstimate,
      resumeFocus: parsed.resumeFocus,
      enrichedAt: new Date(),
    }).run();

    return parsed;
  } catch (error) {
    console.error("Failed to enrich job:", error);
    return null;
  }
}
