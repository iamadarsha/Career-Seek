import { GoogleGenerativeAI } from '@google/generative-ai';
import { MasterProfile, ProfileSchema } from '../schemas/profile';
import { logAiRequest } from './monitoring/ai-logger';

import { withRetry } from '../ai/retry';

/**
 * Helper to try gemini-2.5-flash and fallback to gemini-2.5-flash-lite
 */
export async function generateWithFallback(
  genAI: GoogleGenerativeAI,
  prompt: string,
  config?: any,
  taskType: string = 'custom'
): Promise<string> {
  const startTime = Date.now();
  let modelName = "gemini-2.5-flash";
  
  return withRetry(async () => {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: config
      });
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      
      await logAiRequest({
        taskType: taskType as any,
        modelUsed: modelName,
        latencyMs: Date.now() - startTime,
        succeeded: true,
      });
      
      return text;
    } catch (error: any) {
      // Check for rate limit or quota
      const isQuotaError = error.status === 429 || 
        error.message?.includes('429') || 
        error.message?.toLowerCase().includes('quota') || 
        error.message?.toLowerCase().includes('exhausted') ||
        error.message?.toLowerCase().includes('rate');

      if (isQuotaError && modelName !== "gemini-2.5-flash-lite") {
        console.warn("Falling back to gemini-2.5-flash-lite due to rate limit/quota...");
        modelName = "gemini-2.5-flash-lite";
      }
      
      // Throw to be handled by withRetry
      throw error;
    }
  }, {
    onRetry: async (attempt, error) => {
      console.warn(`[AI Service] Retry attempt ${attempt} for ${taskType} (Model: ${modelName}). Error: ${error.message}`);
      await logAiRequest({
        taskType: taskType as any,
        modelUsed: modelName,
        latencyMs: Date.now() - startTime,
        succeeded: false,
        errorMessage: `Retry ${attempt}: ${error.message}`,
        metadata: { retryAttempt: attempt }
      });
    }
  });
}

/**
 * Validates a Gemini API key by making a tiny test request.
 */
export async function validateApiKey(apiKey: string): Promise<boolean> {
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const text = await generateWithFallback(genAI, "Respond with 'ok'");
    return text.toLowerCase().includes('ok');
  } catch (error) {
    console.error("Gemini API Key validation failed:", error);
    return false;
  }
}

/**
 * Extracts a structured MasterProfile from raw resume text using Gemini.
 */
export async function extractProfile(text: string, apiKey: string): Promise<MasterProfile> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const config = {
    temperature: 0.2,
    responseMimeType: "application/json",
  };

  const prompt = `
  You are an expert career advisor and resume parser.
  Extract the professional profile from the following resume text.
  Respond ONLY with a JSON object that perfectly matches this schema:
  {
    "fullName": "string",
    "headline": "string (inferred professional identity if not explicit)",
    "yearsOfExperience": number (estimated),
    "targetSeniority": "string (e.g. Junior, Mid, Senior, Lead, Staff)",
    "skills": {
      "explicit": ["string"],
      "inferred": ["string (skills they likely have based on their experience but didn't explicitly list)"]
    },
    "tools": ["string (software, frameworks, platforms)"],
    "domains": ["string (industries or business domains)"],
    "experience": [
      { "role": "string", "company": "string", "duration": "string", "summary": "string" }
    ],
    "projects": [
      { "name": "string", "description": "string", "technologies": ["string"] }
    ],
    "achievements": ["string (quantifiable accomplishments)"],
    "education": [
      { "degree": "string", "institution": "string", "year": "string" }
    ],
    "certifications": ["string"],
    "strengths": ["string (inferred professional strengths)"],
    "gaps": ["string (inferred missing clarity or weak areas in the resume)"],
    "rawSummary": "string (a brief summary of the candidate)",
    "metadata": {
      "confidenceNotes": "string (any caveats or notes about extraction confidence)"
    }
  }

  Resume Text:
  ${text}
  `;

  try {
    const responseText = await generateWithFallback(genAI, prompt, config, 'extract_profile');
    const parsedData = JSON.parse(responseText);
    
    // Validate the parsed data against our Zod schema
    return ProfileSchema.parse(parsedData);
  } catch (error) {
    console.error("Profile extraction failed:", error);
    throw new Error("Failed to extract profile. Please try again or fill manually.");
  }
}
