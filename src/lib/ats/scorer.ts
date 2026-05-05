import {
  buildKeywordCoverageReport,
  buildSectionRecommendations,
  type KeywordCoverageItem,
  type KeywordCoverageReport,
} from '../services/documents/keyword-coverage';
import type { JdAnalysis } from '../services/documents/analysis';
import type { TailoredResume } from '../services/documents/resume-tailor';
import {
  createDefaultLocalResumeEmbeddingProvider,
  createLocalKeywordEmbeddingProvider,
} from '../services/resume/embeddings';
import type { ResumeEmbeddingProvider } from '../services/resume/types';
import {
  clampScore,
  collectResumeSections,
  cosineSimilarity,
  extractMetrics,
  normalizeAtsText,
  stringifyJdAnalysis,
  stringifyTailoredResume,
  tokenOverlapScore,
  uniqueNonEmpty,
} from './text';

export type AtsVerdict = 'Strong Match' | 'Moderate Match' | 'Weak Match';

export interface AtsJobContext {
  title?: string | null;
  company?: string | null;
  location?: string | null;
  employmentType?: string | null;
  portal?: string | null;
  url?: string | null;
  snippet?: string | null;
  description?: string | null;
  fullDescription?: string | null;
  [key: string]: unknown;
}

export interface AtsComponentScore {
  id: 'keyword_coverage' | 'section_placement' | 'semantic_similarity' | 'grounding';
  label: string;
  score: number;
  weight: number;
  signals: string[];
  penalties: string[];
}

export interface AtsSectionPlacementItem {
  keyword: string;
  category: string;
  score: number;
  sectionHits: string[];
  signals: string[];
  penalties: string[];
}

export interface AtsGroundingPenalty {
  reason: string;
  impact: number;
  affectedKeywords: string[];
}

export interface AtsSemanticSimilarity {
  score: number;
  cosine: number;
  tokenOverlapScore: number;
  provider: {
    id: string;
    mode: string;
    model?: string;
    dimensions: number;
    fallbackReason?: string;
  };
  fallbackUsed: boolean;
}

export interface AtsCompositeScoreInput {
  resume: TailoredResume;
  jdAnalysis: JdAnalysis;
  jobContext?: AtsJobContext;
  embeddingProvider?: ResumeEmbeddingProvider;
}

export interface AtsCompositeScore {
  atsScore: number;
  keywordScore: number;
  sectionScore: number;
  semanticScore: number;
  riskPenalty: number;
  semanticSummary: string;
  verdict: AtsVerdict;
  advisoryNotice: string;
  keywordsFound: string[];
  keywordsMissing: string[];
  keywordReport: KeywordCoverageReport;
  components: AtsComponentScore[];
  sectionPlacement: {
    score: number;
    items: AtsSectionPlacementItem[];
  };
  semanticSimilarity: AtsSemanticSimilarity;
  grounding: {
    score: number;
    penalties: AtsGroundingPenalty[];
    ungroundedKeywords: string[];
    metricSignals: string[];
  };
  strengths: string[];
  risks: string[];
  sectionRecommendations: Array<{ section: string; recommendation: string }>;
  explanation: string;
  provenance: {
    generationMode: 'local_composite';
    scorerVersion: 'phase-3-local-ats-v1';
    generatedAt: string;
    noCloudCalls: true;
    inputs: {
      resumeSections: number;
      jdKeywords: number;
      jobContextFields: string[];
    };
    methods: string[];
    weights: Record<AtsComponentScore['id'], number>;
    capsApplied: string[];
  };
}

const COMPONENT_WEIGHTS: Record<AtsComponentScore['id'], number> = {
  keyword_coverage: 0.42,
  section_placement: 0.2,
  semantic_similarity: 0.22,
  grounding: 0.16,
};

const CATEGORY_WEIGHTS: Record<string, number> = {
  must_have: 4,
  tool: 3,
  ats: 2.5,
  preferred: 1.5,
  seniority: 1.4,
  leadership: 1.4,
  domain: 1,
};

const HIGH_PRIORITY_CATEGORIES = new Set(['must_have', 'tool', 'ats']);
const EVIDENCE_CATEGORIES = new Set(['must_have', 'tool', 'ats', 'leadership', 'seniority']);
const LOCAL_EMBEDDING_MODES = new Set(['local_keyword_hash', 'local_transformers', 'disabled']);

function categoryWeight(category: string) {
  return CATEGORY_WEIGHTS[category] || 1;
}

function isExperienceSection(sectionId: string) {
  return sectionId.startsWith('experience_');
}

function hasAnyPrefix(sectionHits: string[], prefixes: string[]) {
  return sectionHits.some((section) => prefixes.some((prefix) => section === prefix || section.startsWith(prefix)));
}

function scoreKeywordCoverage(report: KeywordCoverageReport) {
  if (!report.items.length) {
    return {
      score: 0,
      signals: ['No JD keywords were available for local keyword coverage.'],
      penalties: ['The job description analysis did not provide enough ATS terms.'],
    };
  }

  const totals = report.items.reduce(
    (acc, item) => {
      const weight = categoryWeight(item.category);
      acc.total += weight;
      if (item.matched) acc.matched += weight;
      return acc;
    },
    { matched: 0, total: 0 },
  );
  const score = totals.total ? Math.round((totals.matched / totals.total) * 100) : 0;
  const missingMustHave = report.items.filter((item) => item.category === 'must_have' && !item.matched);
  const matchedMustHave = report.items.filter((item) => item.category === 'must_have' && item.matched);

  return {
    score,
    signals: [
      `${report.matched.length} of ${report.items.length} tracked JD terms appear in ATS-visible resume sections.`,
      matchedMustHave.length ? `${matchedMustHave.length} must-have terms are present.` : '',
    ].filter(Boolean),
    penalties: [
      missingMustHave.length ? `${missingMustHave.length} must-have terms are missing or weakly matched.` : '',
      report.missing.length ? `${report.missing.slice(0, 6).join(', ')} need truthful coverage if supported.` : '',
    ].filter(Boolean),
  };
}

function placementScoreForItem(item: KeywordCoverageItem): AtsSectionPlacementItem {
  if (!item.matched) {
    return {
      keyword: item.keyword,
      category: item.category,
      score: 0,
      sectionHits: [],
      signals: [],
      penalties: ['Keyword not found in the tailored resume.'],
    };
  }

  const hits = item.sectionHits;
  const hasHeadline = hits.includes('headline');
  const hasSummary = hits.includes('summary');
  const hasSkills = hits.includes('skills') || hits.includes('tools');
  const hasExperience = hits.some(isExperienceSection);
  const hasEducation = hits.includes('education');
  let score = 35;
  const signals: string[] = [];
  const penalties: string[] = [];

  if (hasHeadline) {
    score += 8;
    signals.push('visible in headline');
  }
  if (hasSummary) {
    score += HIGH_PRIORITY_CATEGORIES.has(item.category) ? 16 : 12;
    signals.push('visible in summary');
  }
  if (hasSkills) {
    score += HIGH_PRIORITY_CATEGORIES.has(item.category) ? 18 : 12;
    signals.push('visible in skills/tools');
  }
  if (hasExperience) {
    score += EVIDENCE_CATEGORIES.has(item.category) ? 30 : 20;
    signals.push('grounded in experience');
  }
  if (hasEducation) {
    score += 8;
    signals.push('supported in education');
  }

  if (EVIDENCE_CATEGORIES.has(item.category) && !hasExperience && !hasEducation) {
    score -= 18;
    penalties.push('present, but not grounded in experience or education');
  }
  if (item.category === 'leadership' && !hasExperience) {
    score -= 15;
    penalties.push('leadership signal is not backed by an experience bullet');
  }
  if (hits.length >= 4) {
    score -= 5;
    penalties.push('appears in many sections; keep wording natural');
  }

  return {
    keyword: item.keyword,
    category: item.category,
    score: Math.round(clampScore(score)),
    sectionHits: hits,
    signals,
    penalties,
  };
}

function scoreSectionPlacement(report: KeywordCoverageReport) {
  const items = report.items.map(placementScoreForItem);
  const matchedItems = items.filter((item) => item.sectionHits.length > 0);

  if (!matchedItems.length) {
    return {
      score: 0,
      items,
      signals: ['No tracked JD terms were placed in the resume sections.'],
      penalties: ['Section placement cannot be trusted until keyword coverage improves.'],
    };
  }

  const totals = matchedItems.reduce(
    (acc, item) => {
      const weight = categoryWeight(item.category);
      acc.total += weight;
      acc.weighted += item.score * weight;
      return acc;
    },
    { weighted: 0, total: 0 },
  );
  const experienceGrounded = matchedItems.filter((item) => hasAnyPrefix(item.sectionHits, ['experience_'])).length;
  const highPriorityWeak = matchedItems.filter((item) => HIGH_PRIORITY_CATEGORIES.has(item.category) && !hasAnyPrefix(item.sectionHits, ['experience_'])).length;

  return {
    score: Math.round(clampScore(totals.total ? totals.weighted / totals.total : 0)),
    items,
    signals: [
      `${experienceGrounded} matched terms are grounded in experience bullets.`,
      matchedItems.some((item) => item.sectionHits.includes('skills') || item.sectionHits.includes('tools')) ? 'Skills/tools section contains JD-visible terms.' : '',
    ].filter(Boolean),
    penalties: [
      highPriorityWeak ? `${highPriorityWeak} high-priority terms are present but not backed by experience evidence.` : '',
    ].filter(Boolean),
  };
}

async function scoreSemanticSimilarity(
  resumeText: string,
  jobText: string,
  embeddingProvider?: ResumeEmbeddingProvider,
): Promise<AtsSemanticSimilarity> {
  const tokenScore = Math.round(tokenOverlapScore(resumeText, jobText));
  const safeLocalEnv = {
    ...process.env,
    CAREER_SEEK_ALLOW_MODEL_DOWNLOADS: '0',
  };
  const primaryProvider = embeddingProvider || createDefaultLocalResumeEmbeddingProvider(safeLocalEnv);
  const provider = primaryProvider.requiresApiKey || !LOCAL_EMBEDDING_MODES.has(primaryProvider.mode)
    ? createLocalKeywordEmbeddingProvider()
    : primaryProvider;
  let fallbackUsed = provider !== primaryProvider;

  try {
    const embeddings = await provider.embed([resumeText, jobText]);
    const resumeEmbedding = embeddings[0]?.vector || [];
    const jobEmbedding = embeddings[1]?.vector || [];
    if (!resumeEmbedding.length || !jobEmbedding.length) {
      throw new Error('Embedding provider returned empty vectors.');
    }

    const cosine = cosineSimilarity(resumeEmbedding, jobEmbedding);
    const cosineScore = clampScore(Math.max(0, cosine) * 100);
    const score = Math.round(clampScore((cosineScore * 0.72) + (tokenScore * 0.28)));

    return {
      score,
      cosine: Number(cosine.toFixed(4)),
      tokenOverlapScore: tokenScore,
      provider: {
        id: provider.id,
        mode: embeddings[0]?.mode || provider.mode,
        model: embeddings[0]?.model,
        dimensions: embeddings[0]?.dimensions || provider.dimensions,
        fallbackReason: provider.fallbackReason,
      },
      fallbackUsed: fallbackUsed || embeddings.some((embedding) => embedding.mode === 'local_keyword_hash' && provider.mode !== 'local_keyword_hash'),
    };
  } catch (error) {
    fallbackUsed = true;
    const fallbackProvider = createLocalKeywordEmbeddingProvider();
    const embeddings = await fallbackProvider.embed([resumeText, jobText]);
    const cosine = cosineSimilarity(embeddings[0]?.vector || [], embeddings[1]?.vector || []);
    const cosineScore = clampScore(Math.max(0, cosine) * 100);

    return {
      score: Math.round(clampScore((cosineScore * 0.65) + (tokenScore * 0.35))),
      cosine: Number(cosine.toFixed(4)),
      tokenOverlapScore: tokenScore,
      provider: {
        id: fallbackProvider.id,
        mode: fallbackProvider.mode,
        model: embeddings[0]?.model,
        dimensions: embeddings[0]?.dimensions || fallbackProvider.dimensions,
        fallbackReason: error instanceof Error ? error.message : String(error ?? 'Embedding fallback used.'),
      },
      fallbackUsed,
    };
  }
}

function scoreGrounding(report: KeywordCoverageReport, resume: TailoredResume, resumeText: string) {
  const highPriorityMatched = report.items.filter((item) => item.matched && EVIDENCE_CATEGORIES.has(item.category));
  const ungrounded = highPriorityMatched.filter((item) => {
    const backedByExperience = item.sectionHits.some(isExperienceSection);
    const backedByEducation = item.sectionHits.includes('education');
    return !backedByExperience && !backedByEducation;
  });
  const missingMustHave = report.items.filter((item) => item.category === 'must_have' && !item.matched);
  const experienceSections = collectResumeSections(resume).filter((section) => isExperienceSection(section.id) && normalizeAtsText(section.text));
  const metricSignals = extractMetrics(resumeText);
  const penalties: AtsGroundingPenalty[] = [];

  if (ungrounded.length) {
    const impact = Math.min(32, 8 + (ungrounded.length * 4));
    penalties.push({
      reason: 'High-priority terms appear outside evidence-heavy sections.',
      impact,
      affectedKeywords: ungrounded.map((item) => item.keyword).slice(0, 10),
    });
  }
  if (missingMustHave.length) {
    const impact = Math.min(24, missingMustHave.length * 5);
    penalties.push({
      reason: 'Must-have JD terms are missing or weakly covered.',
      impact,
      affectedKeywords: missingMustHave.map((item) => item.keyword).slice(0, 10),
    });
  }
  if (!experienceSections.length) {
    penalties.push({
      reason: 'No experience section is available to ground role claims.',
      impact: 22,
      affectedKeywords: highPriorityMatched.map((item) => item.keyword).slice(0, 8),
    });
  }
  if (metricSignals.length > 10) {
    penalties.push({
      reason: 'Many numeric claims are present; keep only metrics supported by the source resume.',
      impact: Math.min(12, metricSignals.length - 8),
      affectedKeywords: metricSignals.slice(0, 8),
    });
  }

  const totalPenalty = penalties.reduce((sum, item) => sum + item.impact, 0);
  return {
    score: Math.round(clampScore(100 - totalPenalty, 25, 100)),
    penalties,
    ungroundedKeywords: ungrounded.map((item) => item.keyword),
    metricSignals,
    signals: [
      `${Math.max(0, highPriorityMatched.length - ungrounded.length)} high-priority matched terms are backed by experience or education.`,
      metricSignals.length ? `${metricSignals.length} numeric signals detected for review.` : '',
    ].filter(Boolean),
    penaltyLabels: penalties.map((item) => `${item.reason} (-${item.impact})`),
  };
}

function applyScoreCaps(score: number, report: KeywordCoverageReport, groundingScore: number) {
  let cappedScore = score;
  const capsApplied: string[] = [];
  const mustHaveItems = report.items.filter((item) => item.category === 'must_have');
  const missingMustHave = mustHaveItems.filter((item) => !item.matched);
  const missingMustRatio = mustHaveItems.length ? missingMustHave.length / mustHaveItems.length : 0;

  if (missingMustRatio >= 0.7 && cappedScore > 58) {
    cappedScore = 58;
    capsApplied.push('Capped at 58 because most must-have terms are missing.');
  } else if (missingMustRatio >= 0.4 && cappedScore > 74) {
    cappedScore = 74;
    capsApplied.push('Capped at 74 because several must-have terms are missing.');
  }

  if (report.coveragePct < 35 && cappedScore > 64) {
    cappedScore = 64;
    capsApplied.push('Capped at 64 because local keyword coverage is below 35%.');
  }

  if (groundingScore < 50 && cappedScore > 72) {
    cappedScore = 72;
    capsApplied.push('Capped at 72 because grounding confidence is weak.');
  }

  return { score: Math.round(clampScore(cappedScore)), capsApplied };
}

function verdictFor(score: number): AtsVerdict {
  if (score >= 80) return 'Strong Match';
  if (score >= 62) return 'Moderate Match';
  return 'Weak Match';
}

function buildRecommendations(
  report: KeywordCoverageReport,
  placementItems: AtsSectionPlacementItem[],
  grounding: ReturnType<typeof scoreGrounding>,
  semantic: AtsSemanticSimilarity,
) {
  const base = buildSectionRecommendations(report);
  const weakPlacement = placementItems
    .filter((item) => item.sectionHits.length && item.score < 65 && HIGH_PRIORITY_CATEGORIES.has(item.category))
    .slice(0, 5);
  const recommendations = [
    ...base,
    weakPlacement.length ? {
      section: 'Experience',
      recommendation: `If accurate and supported by the source resume, back these matched terms with concrete experience bullets: ${weakPlacement.map((item) => item.keyword).join(', ')}.`,
    } : null,
    grounding.ungroundedKeywords.length ? {
      section: 'Evidence',
      recommendation: `Review ${grounding.ungroundedKeywords.slice(0, 6).join(', ')} for truthful grounding; remove terms that only mirror the JD without resume evidence.`,
    } : null,
    semantic.score < 45 ? {
      section: 'Summary',
      recommendation: 'Use the job description language naturally in the summary and top bullets where it reflects real experience.',
    } : null,
  ].filter((item): item is { section: string; recommendation: string } => Boolean(item));

  const seen = new Set<string>();
  return recommendations.filter((item) => {
    const key = `${normalizeAtsText(item.section)}:${normalizeAtsText(item.recommendation)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);
}

function buildStrengths(report: KeywordCoverageReport, placementScore: number, semantic: AtsSemanticSimilarity, groundingScore: number) {
  return uniqueNonEmpty([
    report.matched.length ? `Covers ${report.matched.length} tracked JD terms, including ${report.matched.slice(0, 6).join(', ')}.` : '',
    placementScore >= 70 ? 'Relevant terms are visible in ATS-readable sections, with several grounded in experience.' : '',
    semantic.score >= 60 ? 'Local semantic comparison shows meaningful overlap between the resume and role context.' : '',
    groundingScore >= 75 ? 'Most matched high-priority terms have enough local grounding for an advisory match.' : '',
  ], 5);
}

function buildRisks(report: KeywordCoverageReport, placementItems: AtsSectionPlacementItem[], grounding: ReturnType<typeof scoreGrounding>, semantic: AtsSemanticSimilarity) {
  const weakPlacementTerms = placementItems
    .filter((item) => item.sectionHits.length && item.score < 65 && HIGH_PRIORITY_CATEGORIES.has(item.category))
    .map((item) => item.keyword);

  return uniqueNonEmpty([
    report.missing.length ? `Missing or weak coverage for ${report.missing.slice(0, 6).join(', ')}.` : '',
    weakPlacementTerms.length ? `Some high-priority terms are present but not strongly placed: ${weakPlacementTerms.slice(0, 6).join(', ')}.` : '',
    grounding.penalties.length ? grounding.penalties.map((item) => item.reason).join(' ') : '',
    semantic.score < 45 ? 'Local semantic similarity is low, so the resume may not read like a close role match.' : '',
  ], 6);
}

export async function computeCompositeAtsScore(input: AtsCompositeScoreInput): Promise<AtsCompositeScore> {
  const jobContext = input.jobContext || {};
  const keywordReport = buildKeywordCoverageReport(input.resume, input.jdAnalysis);
  const keyword = scoreKeywordCoverage(keywordReport);
  const placement = scoreSectionPlacement(keywordReport);
  const resumeText = stringifyTailoredResume(input.resume);
  const jobText = stringifyJdAnalysis(input.jdAnalysis, jobContext);
  const semantic = await scoreSemanticSimilarity(resumeText, jobText, input.embeddingProvider);
  const grounding = scoreGrounding(keywordReport, input.resume, resumeText);

  const components: AtsComponentScore[] = [
    {
      id: 'keyword_coverage',
      label: 'Keyword coverage',
      score: keyword.score,
      weight: COMPONENT_WEIGHTS.keyword_coverage,
      signals: keyword.signals,
      penalties: keyword.penalties,
    },
    {
      id: 'section_placement',
      label: 'Section placement',
      score: placement.score,
      weight: COMPONENT_WEIGHTS.section_placement,
      signals: placement.signals,
      penalties: placement.penalties,
    },
    {
      id: 'semantic_similarity',
      label: 'Semantic similarity',
      score: semantic.score,
      weight: COMPONENT_WEIGHTS.semantic_similarity,
      signals: [
        `Cosine similarity ${semantic.cosine.toFixed(4)} using ${semantic.provider.mode}.`,
        `Token overlap fallback signal ${semantic.tokenOverlapScore}%.`,
      ],
      penalties: semantic.fallbackUsed ? ['Semantic embeddings used deterministic local fallback.'] : [],
    },
    {
      id: 'grounding',
      label: 'Evidence grounding',
      score: grounding.score,
      weight: COMPONENT_WEIGHTS.grounding,
      signals: grounding.signals,
      penalties: grounding.penaltyLabels,
    },
  ];

  const weightedScore = components.reduce((sum, component) => (
    sum + (component.score * component.weight)
  ), 0) / components.reduce((sum, component) => sum + component.weight, 0);
  const capped = applyScoreCaps(weightedScore, keywordReport, grounding.score);
  const verdict = verdictFor(capped.score);
  const strengths = buildStrengths(keywordReport, placement.score, semantic, grounding.score);
  const risks = buildRisks(keywordReport, placement.items, grounding, semantic);
  const jobLabel = uniqueNonEmpty([jobContext.title, jobContext.company], 2).join(' at ') || 'the selected job';
  const totalRiskPenalty = grounding.penalties.reduce((total, penalty) => total + penalty.impact, 0);
  const semanticSummary = `Meaning match is ${semantic.score}% using ${semantic.fallbackUsed ? 'local fallback vectors' : semantic.provider.mode.replace(/_/g, ' ')}. Keyword overlap contributed ${semantic.tokenOverlapScore}% and cosine similarity was ${semantic.cosine}.`;

  return {
    atsScore: capped.score,
    keywordScore: keyword.score,
    sectionScore: placement.score,
    semanticScore: semantic.score,
    riskPenalty: totalRiskPenalty,
    semanticSummary,
    verdict,
    advisoryNotice: 'This is a local advisory fit estimate based on resume/JD text, embeddings, and keyword placement. It is not an employer ATS result or guarantee.',
    keywordsFound: keywordReport.matched,
    keywordsMissing: keywordReport.missing,
    keywordReport,
    components,
    sectionPlacement: {
      score: placement.score,
      items: placement.items,
    },
    semanticSimilarity: semantic,
    grounding: {
      score: grounding.score,
      penalties: grounding.penalties,
      ungroundedKeywords: grounding.ungroundedKeywords,
      metricSignals: grounding.metricSignals,
    },
    strengths,
    risks,
    sectionRecommendations: buildRecommendations(keywordReport, placement.items, grounding, semantic),
    explanation: `Local composite ATS advisory for ${jobLabel}: ${keyword.score}% keyword coverage, ${placement.score}% section placement, ${semantic.score}% semantic similarity, and ${grounding.score}% evidence grounding. Review missing terms only if they are truthful and supported by the source resume.`,
    provenance: {
      generationMode: 'local_composite',
      scorerVersion: 'phase-3-local-ats-v1',
      generatedAt: new Date().toISOString(),
      noCloudCalls: true,
      inputs: {
        resumeSections: collectResumeSections(input.resume).length,
        jdKeywords: keywordReport.items.length,
        jobContextFields: Object.entries(jobContext)
          .filter(([, value]) => normalizeAtsText(value).length > 0)
          .map(([key]) => key)
          .sort(),
      },
      methods: [
        'weighted local keyword coverage',
        'ATS-visible section placement',
        'local embedding cosine similarity with deterministic fallback',
        'evidence and grounding penalties',
      ],
      weights: COMPONENT_WEIGHTS,
      capsApplied: capped.capsApplied,
    },
  };
}

export {
  cosineSimilarity,
};
