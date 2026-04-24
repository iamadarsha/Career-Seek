/**
 * Grounded Answer Service — Phase F
 * 
 * RAG pipeline: retrieve → inject context → generate → cite sources.
 * Produces structured answers with confidence levels and source references.
 */

import { z } from 'zod';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getAppConfig } from '../../config';
import { generateWithFallback } from '../gemini';
import { retrieve, RetrievalScope, RetrievedChunk } from './retriever';

// ── Types ──────────────────────────────────────────────────────────────────

export const GroundedAnswerSchema = z.object({
  answer: z.string(),
  confidenceLevel: z.enum(['high', 'medium', 'low']),
  reasoning: z.string().optional(),
  sourceReferences: z.array(z.object({
    chunkIndex: z.number(),
    relevance: z.string(), // brief explanation of why this source was used
  })),
  suggestedFollowUps: z.array(z.string()).optional(),
  caveats: z.array(z.string()).optional(),
});

export type GroundedAnswer = z.infer<typeof GroundedAnswerSchema>;

export interface CoachResponse {
  answer: GroundedAnswer;
  sources: RetrievedChunk[];
  retrievalTimeMs: number;
  generationTimeMs: number;
}

// ── Answer generation ──────────────────────────────────────────────────────

export async function generateGroundedAnswer(
  question: string,
  scope: RetrievalScope,
  scoredJobId: number | null,
  conversationHistory: Array<{ role: string; content: string }> = [],
  answerMode: 'concise' | 'detailed' = 'concise',
): Promise<CoachResponse> {
  const config = getAppConfig();
  if (!config.geminiApiKey) {
    throw new Error('No Gemini API key configured.');
  }

  // 1. Retrieve relevant evidence
  const topK = answerMode === 'detailed' ? 12 : 8;
  const retrieval = await retrieve(question, scope, scoredJobId, topK);

  const genAI = new GoogleGenerativeAI(config.geminiApiKey);
  const genStart = Date.now();

  // 2. Build grounded context
  const evidenceBlock = retrieval.chunks
    .map((chunk, idx) => 
      `[Source ${idx + 1}] (${chunk.sourceLabel})\n${chunk.content}`
    )
    .join('\n\n---\n\n');

  // 3. Build conversation context (last 4 messages max)
  const recentHistory = conversationHistory.slice(-4);
  const historyBlock = recentHistory.length > 0
    ? `\nRecent conversation:\n${recentHistory.map(m => `${m.role}: ${m.content}`).join('\n')}\n`
    : '';

  // 4. Construct prompt
  const modeInstruction = answerMode === 'detailed'
    ? 'Provide a thorough, detailed answer with specific examples from the sources.'
    : 'Provide a concise, actionable answer. Be direct and specific.';

  const prompt = `
You are an expert career coach and interview preparation advisor.
You are helping a user with their job search strategy, resume optimization, and interview preparation.

${modeInstruction}

CRITICAL RULES:
1. ONLY use information from the provided source materials below. Do NOT fabricate facts.
2. If the sources don't contain enough information to answer the question, say so honestly and set confidenceLevel to "low".
3. Clearly distinguish between facts from sources and your professional interpretation.
4. Reference specific source numbers when making claims (e.g., "Based on Source 1...").
5. For interview questions, ground them in the actual job requirements and the user's experience.
6. Never invent skills, experiences, or achievements the user doesn't have.
7. Be respectful, practical, and confident without overclaiming.

SOURCE MATERIALS:
${evidenceBlock || '(No relevant sources found)'}
${historyBlock}

USER QUESTION: ${question}

Respond with a STRICT JSON object matching this schema:
{
  "answer": "string (the main response, using markdown formatting for readability)",
  "confidenceLevel": "high" | "medium" | "low",
  "reasoning": "optional string - brief explanation of how you arrived at this answer",
  "sourceReferences": [
    { "chunkIndex": number (1-based source index), "relevance": "string (why this source was used)" }
  ],
  "suggestedFollowUps": ["string (2-3 natural follow-up questions the user might ask)"],
  "caveats": ["string (any important caveats or limitations of this answer)"]
}
`;

  try {
    const responseText = await generateWithFallback(genAI, prompt, {
      temperature: 0.2,
      responseMimeType: 'application/json',
    });

    const parsed = JSON.parse(responseText);
    const validated = GroundedAnswerSchema.parse(parsed);

    return {
      answer: validated,
      sources: retrieval.chunks,
      retrievalTimeMs: retrieval.retrievalTimeMs,
      generationTimeMs: Date.now() - genStart,
    };
  } catch (error: any) {
    console.error('Grounded answer generation failed:', error);
    
    // Fallback answer
    return {
      answer: {
        answer: 'I wasn\'t able to generate a grounded answer right now. This may be due to a temporary API issue. Please try again.',
        confidenceLevel: 'low',
        sourceReferences: [],
        suggestedFollowUps: ['Can you retry my question?'],
        caveats: ['Generation failed — this is a fallback response.'],
      },
      sources: retrieval.chunks,
      retrievalTimeMs: retrieval.retrievalTimeMs,
      generationTimeMs: Date.now() - genStart,
    };
  }
}

// ── Suggested prompt generator ─────────────────────────────────────────────

export function getSuggestedPrompts(options: {
  hasJob: boolean;
  hasResume: boolean;
  hasAtsReport: boolean;
}): string[] {
  const prompts: string[] = [];

  if (options.hasJob) {
    prompts.push(
      'How does my background fit this role?',
      'What are the biggest risks in my application?',
      'What interview questions should I prepare for?',
      'What are the strongest signals in this JD?',
    );
  }

  if (options.hasResume) {
    prompts.push(
      'Which projects should I emphasize?',
      'How should I explain my career trajectory?',
    );
  }

  if (options.hasAtsReport) {
    prompts.push(
      'Which ATS keywords am I still weak on?',
      'Should I regenerate my resume?',
    );
  }

  if (options.hasJob) {
    prompts.push(
      'How should I message the hiring manager?',
      'What salary range should I target?',
      'Should I apply for this role?',
    );
  }

  if (!options.hasJob) {
    prompts.push(
      'What are my strongest professional angles?',
      'What skills should I develop next?',
      'How should I position myself in the market?',
    );
  }

  return prompts.slice(0, 8); // Max 8 suggestions
}
