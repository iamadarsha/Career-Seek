import { z } from 'zod';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getAppConfig } from '../../config';
import { generateWithFallback } from '../gemini';
import { JdAnalysis } from './analysis';
import { TailoredResume } from './resume-tailor';

export const AtsReportSchema = z.object({
  atsScore: z.number(), // 0 to 100
  keywordsFound: z.array(z.string()),
  keywordsMissing: z.array(z.string()),
  strengths: z.array(z.string()),
  risks: z.array(z.string()),
  sectionRecommendations: z.array(z.object({
    section: z.string(),
    recommendation: z.string()
  })),
  verdict: z.enum(["Strong Match", "Moderate Match", "Weak Match"])
});

export type AtsReport = z.infer<typeof AtsReportSchema>;

export async function verifyAtsFit(
  resume: TailoredResume, 
  jdAnalysis: JdAnalysis, 
  jobContext: any
): Promise<AtsReport | null> {
  const config = getAppConfig();
  if (!config.geminiApiKey) throw new Error("No Gemini API key configured.");

  const genAI = new GoogleGenerativeAI(config.geminiApiKey);

  const prompt = `
    You are an expert ATS (Applicant Tracking System) scanner and technical recruiter.
    Analyze the provided tailored resume against the target job context and return a verification report.

    Target Job Context:
    Title: ${jobContext.title}
    Company: ${jobContext.company}
    Must-have Skills: ${jdAnalysis.mustHaveSkills.join(', ')}
    ATS Keywords: ${jdAnalysis.atsKeywords.join(', ')}
    
    Tailored Resume to Evaluate:
    ${JSON.stringify(resume, null, 2)}

    Evaluate the resume for keyword density, skill alignment, and formatting risks.
    Return a STRICT JSON object matching this schema:
    {
      "atsScore": number (0 to 100 representing predicted ATS match percentage),
      "keywordsFound": ["string"],
      "keywordsMissing": ["string"],
      "strengths": ["string (e.g. 'Strong overlap in frontend frameworks')"],
      "risks": ["string (e.g. 'Missing required cloud certification')"],
      "sectionRecommendations": [
        { "section": "string", "recommendation": "string" }
      ],
      "verdict": "Strong Match" | "Moderate Match" | "Weak Match"
    }
  `;

  try {
    const responseText = await generateWithFallback(genAI, prompt, {
      temperature: 0.1,
      responseMimeType: "application/json",
    }, 'ats_check');

    const parsedData = JSON.parse(responseText);
    const validated = AtsReportSchema.parse(parsedData);
    
    return validated;
  } catch (error) {
    console.error("Failed to verify ATS fit:", error);
    return null;
  }
}
