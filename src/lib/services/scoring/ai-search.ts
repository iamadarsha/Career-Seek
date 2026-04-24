import { GoogleGenerativeAI } from '@google/generative-ai';
import { generateWithFallback } from '../gemini';
import { getAppConfig } from '../../config';
import { getDb } from '../../../db';
import { searchQueries } from '../../../db/schema';

export async function executeAiSearch(query: string, scoredJobs: any[]): Promise<any[]> {
  const config = getAppConfig();
  if (!config.geminiApiKey) {
    throw new Error("No Gemini API key configured.");
  }

  const genAI = new GoogleGenerativeAI(config.geminiApiKey);
  const genConfig = {
    temperature: 0.1,
    responseMimeType: "application/json",
  };

  // To save tokens, we only send an ID and a brief summary of the top scored jobs.
  const jobsContext = scoredJobs.slice(0, 50).map(j => ({
    id: j.id,
    title: j.normalizedJob?.title,
    company: j.normalizedJob?.company,
    snippet: j.normalizedJob?.snippet,
    tier: j.tier,
    location: j.normalizedJob?.location,
  }));

  const prompt = `
  You are an AI job search engine.
  The user is querying their local job database.
  
  Query: "${query}"
  
  Here are the candidate jobs (ID, Title, Company, Location, Tier, Snippet):
  ${JSON.stringify(jobsContext)}
  
  Return a strict JSON array of objects, containing the job IDs that match the query and a brief 1-sentence reason why. 
  Only include jobs that truly match the user's intent. Rank them by best match first.
  Format:
  [
    { "id": number, "reason": "string" }
  ]
  `;

  try {
    const responseText = await generateWithFallback(genAI, prompt, genConfig);
    const parsed = JSON.parse(responseText);
    
    const db = getDb();
    db.insert(searchQueries).values({
      query,
      results: JSON.stringify(parsed),
      timestamp: new Date()
    }).run();

    return parsed;
  } catch (error) {
    console.error("AI Search failed:", error);
    return [];
  }
}
