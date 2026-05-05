import { z } from 'zod';
import { discoverAIProviderConfigs } from '../../ai/providers';
import { getAIRuntimeEnv, getAppConfig } from '../../config';
import { computeCompositeAtsScore, type AtsCompositeScore } from '../../ats/scorer';
import { generateDocumentJson, JdAnalysis, safeDocumentAiErrorMessage } from './analysis';
import { TailoredResume } from './resume-tailor';

export const AtsReportSchema = z.object({
  atsScore: z.number(),
  keywordScore: z.number().optional(),
  semanticScore: z.number().optional(),
  sectionScore: z.number().optional(),
  riskPenalty: z.number().optional(),
  semanticSummary: z.string().optional(),
  advisoryNotice: z.string().optional(),
  keywordsFound: z.array(z.string()),
  keywordsMissing: z.array(z.string()),
  strengths: z.array(z.string()),
  risks: z.array(z.string()),
  sectionRecommendations: z.array(z.object({
    section: z.string(),
    recommendation: z.string(),
  })),
  verdict: z.enum(['Strong Match', 'Moderate Match', 'Weak Match']),
  keywordReport: z.object({
    coveragePct: z.number(),
    matched: z.array(z.string()),
    missing: z.array(z.string()),
    items: z.array(z.object({
      keyword: z.string(),
      category: z.string(),
      matched: z.boolean(),
      sectionHits: z.array(z.string()),
    })),
  }).optional(),
  components: z.array(z.object({
    id: z.string(),
    label: z.string(),
    score: z.number(),
    weight: z.number(),
    signals: z.array(z.string()),
    penalties: z.array(z.string()),
  })).optional(),
  sectionPlacement: z.any().optional(),
  semanticSimilarity: z.any().optional(),
  grounding: z.any().optional(),
  explanation: z.string().optional(),
  provenance: z.object({
    generationMode: z.string(),
    model: z.string().optional(),
    fallbackReason: z.string().optional(),
  }).passthrough().optional(),
});

export type AtsReport = z.infer<typeof AtsReportSchema>;

function advisoryText(value: unknown) {
  return String(value || '')
    .replace(/\bwill be filtered\b/gi, 'may be screened less favorably')
    .replace(/\bhigh risk of being filtered by ATS\b/gi, 'could reduce local keyword match confidence')
    .replace(/\bguarantees?\b/gi, 'suggests')
    .replace(/\bguaranteed\b/gi, 'suggested')
    .trim();
}

function lowerFirst(value: string) {
  return value ? value.charAt(0).toLowerCase() + value.slice(1) : value;
}

function advisoryRecommendation(value: { section: string; recommendation: string }) {
  const recommendation = advisoryText(value.recommendation);
  const alreadyGuarded = /\b(if|where|when)\b.*\b(supported|accurate|true|proof|source|resume|profile)\b/i.test(recommendation);
  const editInstruction = /\b(add|insert|include|integrate|move|mention|rephrase|show)\b/i.test(recommendation);
  return {
    section: value.section || 'Overall',
    recommendation: !alreadyGuarded && editInstruction
      ? `If accurate and supported by the source resume, ${lowerFirst(recommendation)}`
      : recommendation,
  };
}

function sanitizeReportText(report: AtsReport): AtsReport {
  return {
    ...report,
    strengths: (report.strengths || []).map(advisoryText).filter(Boolean),
    risks: (report.risks || []).map(advisoryText).filter(Boolean),
    sectionRecommendations: (report.sectionRecommendations || []).map(advisoryRecommendation),
    explanation: report.explanation ? advisoryText(report.explanation) : report.explanation,
  };
}

function componentScore(composite: AtsCompositeScore, id: string) {
  return composite.components.find((component) => component.id === id)?.score;
}

function riskPenalty(composite: AtsCompositeScore) {
  return composite.grounding.penalties.reduce((total, penalty) => total + penalty.impact, 0);
}

function semanticSummary(composite: AtsCompositeScore) {
  const semantic = composite.semanticSimilarity;
  const mode = semantic.fallbackUsed ? 'local fallback vectors' : semantic.provider.mode.replace(/_/g, ' ');
  return `Meaning match is ${semantic.score}% using ${mode}. Keyword overlap contributed ${semantic.tokenOverlapScore}% and cosine similarity was ${semantic.cosine}.`;
}

function reportFromComposite(
  composite: AtsCompositeScore,
  options: {
    strengths?: string[];
    risks?: string[];
    sectionRecommendations?: Array<{ section: string; recommendation: string }>;
    explanation?: string;
    generationMode?: string;
    model?: string;
    fallbackReason?: string;
  } = {},
): AtsReport {
  return sanitizeReportText({
    atsScore: composite.atsScore,
    keywordScore: componentScore(composite, 'keyword_coverage'),
    semanticScore: componentScore(composite, 'semantic_similarity'),
    sectionScore: componentScore(composite, 'section_placement'),
    riskPenalty: riskPenalty(composite),
    semanticSummary: semanticSummary(composite),
    advisoryNotice: composite.advisoryNotice,
    keywordsFound: composite.keywordsFound,
    keywordsMissing: composite.keywordsMissing,
    strengths: options.strengths?.length ? options.strengths : composite.strengths,
    risks: options.risks?.length ? options.risks : composite.risks,
    sectionRecommendations: options.sectionRecommendations?.length
      ? options.sectionRecommendations
      : composite.sectionRecommendations,
    verdict: composite.verdict,
    keywordReport: composite.keywordReport,
    components: composite.components,
    sectionPlacement: composite.sectionPlacement,
    semanticSimilarity: composite.semanticSimilarity,
    grounding: composite.grounding,
    explanation: options.explanation || composite.explanation,
    provenance: {
      ...composite.provenance,
      generationMode: options.generationMode || composite.provenance.generationMode,
      model: options.model,
      fallbackReason: options.fallbackReason,
    },
  });
}

function hasConfiguredQualitativeProvider() {
  const env = getAIRuntimeEnv(getAppConfig());
  const providers = discoverAIProviderConfigs(env);

  return providers.some((provider) => {
    if (!provider.enabled) return false;
    if (provider.providerKind !== 'local') {
      return provider.requiresApiKey ? Boolean(provider.apiKey) : Boolean(provider.baseUrl);
    }

    return (
      env.CAREER_SEEK_AI_PROVIDER === 'ollama' ||
      env.CAREER_SEEK_ENABLE_OLLAMA === '1' ||
      Boolean(env.OLLAMA_BASE_URL || env.CAREER_SEEK_OLLAMA_MODEL)
    );
  });
}

export async function verifyAtsFit(
  resume: TailoredResume,
  jdAnalysis: JdAnalysis,
  jobContext: any,
): Promise<AtsReport | null> {
  const composite = await computeCompositeAtsScore({ resume, jdAnalysis, jobContext });
  const localReport = reportFromComposite(composite);

  if (!hasConfiguredQualitativeProvider()) {
    return reportFromComposite(composite, {
      fallbackReason: 'No live AI provider was configured; local composite scoring was used.',
    });
  }

  const prompt = `
    You are an expert resume reviewer and technical recruiter.
    Career Seek has already computed the local ATS advisory using keyword coverage, section placement, local embeddings, and evidence grounding.
    Add qualitative feedback only. Do not override the score or keyword lists.

    Target Job Context:
    Title: ${jobContext.title}
    Company: ${jobContext.company}
    Must-have Skills: ${jdAnalysis.mustHaveSkills.join(', ')}
    ATS Keywords: ${jdAnalysis.atsKeywords.join(', ')}

    Tailored Resume:
    ${JSON.stringify(resume, null, 2)}

    Local Composite ATS Advisory:
    ${JSON.stringify(localReport, null, 2)}

    Return a STRICT JSON object matching this schema:
    {
      "atsScore": ${composite.atsScore},
      "keywordsFound": ${JSON.stringify(composite.keywordsFound)},
      "keywordsMissing": ${JSON.stringify(composite.keywordsMissing)},
      "strengths": ["string"],
      "risks": ["string"],
      "sectionRecommendations": [
        { "section": "string", "recommendation": "string" }
      ],
      "verdict": "${composite.verdict}",
      "explanation": "human-readable explanation that does not overclaim employer ATS outcomes"
    }
  `;

  try {
    const { data: parsedData, provider, model } = await generateDocumentJson<any>(prompt, 'ats_check', {
      temperature: 0.1,
      schema: AtsReportSchema,
    });
    const validated = AtsReportSchema.parse(reportFromComposite(composite, {
      strengths: Array.isArray(parsedData.strengths) ? parsedData.strengths.map(String) : [],
      risks: Array.isArray(parsedData.risks) ? parsedData.risks.map(String) : [],
      sectionRecommendations: (parsedData.sectionRecommendations?.length ? parsedData.sectionRecommendations : composite.sectionRecommendations)
        .map((item: any) => advisoryRecommendation({
          section: String(item?.section || 'Overall'),
          recommendation: String(item?.recommendation || ''),
        })),
      explanation: parsedData.explanation || composite.explanation,
      generationMode: 'ai_qualitative_with_local_composite',
      model: `${provider}/${model}`,
    }));

    return sanitizeReportText(validated);
  } catch (error) {
    console.error(`Failed to add AI ATS feedback; using local composite report: ${safeDocumentAiErrorMessage(error)}`);
    return reportFromComposite(composite, {
      fallbackReason: `AI qualitative feedback unavailable: ${safeDocumentAiErrorMessage(error)}`,
    });
  }
}
