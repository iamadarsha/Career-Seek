import { chunkResumeDocument } from './chunker';
import { createDefaultLocalResumeEmbeddingProvider, embedResumeChunks } from './embeddings';
import {
  getResumeParserAdapterPlan,
  inferResumeFileKind,
  parseResumeWithLocalAdapter,
} from './parser-adapters';
import {
  createResumeVectorStoreFromEnv,
  resumeChunkToVectorPoint,
} from './vector-store';
import type {
  ResumeEmbeddingProvider,
  ResumePipelineMetadata,
  ResumePipelinePlan,
  ResumePipelineRunResult,
  ResumePipelineStageSnapshot,
  ResumePipelineSource,
  ResumeVectorStoreClient,
} from './types';

export interface ResumePipelineOptions {
  useExternalEmbeddings?: boolean;
  enableVectorStore?: boolean;
}

export interface ResumePipelineServices {
  embeddingProvider?: ResumeEmbeddingProvider;
  vectorStore?: ResumeVectorStoreClient;
}

export function createResumePipelinePlan(
  source: ResumePipelineSource,
  options: ResumePipelineOptions = {},
): ResumePipelinePlan {
  const sourceKind = inferResumeFileKind(source);
  const parserAdapters = getResumeParserAdapterPlan();
  const usingExternalEmbeddings = Boolean(options.useExternalEmbeddings);
  const vectorStoreEnabled = Boolean(options.enableVectorStore);
  const warnings: string[] = [];

  if (sourceKind === 'unknown') {
    warnings.push('Source type is unknown. Only PDF, DOCX, or manual text should enter the local resume pipeline.');
  }

  if (!usingExternalEmbeddings) {
    warnings.push('No embedding API key is required. The default plan uses local transformer embeddings when cached, then deterministic keyword-hash vectors as fallback.');
  }

  if (!vectorStoreEnabled) {
    warnings.push('Vector storage is disabled unless a Qdrant client is explicitly configured.');
  }

  return {
    sourceKind,
    parserAdapters,
    warnings,
    stages: [
      {
        id: 'ingest',
        label: 'Validate resume source',
        mode: 'local',
        required: true,
        available: sourceKind !== 'unknown',
        notes: ['Accept PDF, DOCX, or pasted text only.'],
      },
      {
        id: 'parse',
        label: 'Extract text with local parser adapters',
        mode: 'local',
        required: true,
        available: parserAdapters.some((adapter) => adapter.fileKinds.includes(sourceKind) && adapter.isAvailable),
        fallback: 'manual_text',
        notes: ['Use pdf-parse or mammoth first, then local layout/OCR recovery when available.'],
      },
      {
        id: 'normalize',
        label: 'Normalize resume sections',
        mode: 'local',
        required: true,
        available: true,
        notes: ['Detect common resume headings and preserve source provenance.'],
      },
      {
        id: 'chunk',
        label: 'Create section-aware resume chunks',
        mode: 'local',
        required: true,
        available: true,
        notes: ['Stable chunk IDs are derived from resume, section, and text content.'],
      },
      {
        id: 'embed',
        label: usingExternalEmbeddings ? 'Embed chunks with configured provider' : 'Embed chunks locally',
        mode: usingExternalEmbeddings ? 'external' : 'local',
        required: false,
        available: true,
        fallback: 'local_keyword_hash',
        notes: [
          usingExternalEmbeddings
            ? 'External embeddings can be injected later through ResumeEmbeddingProvider.'
            : 'Local embeddings use Xenova when available and deterministic keyword-hash vectors as the no-cloud fallback.',
        ],
      },
      {
        id: 'store',
        label: 'Store vectors in Qdrant-compatible backend',
        mode: vectorStoreEnabled ? 'external' : 'disabled',
        required: false,
        available: vectorStoreEnabled,
        fallback: 'disabled_vector_store',
        notes: ['Qdrant is represented by an HTTP client shape and remains opt-in.'],
      },
      {
        id: 'extract',
        label: 'Extract structured resume fields',
        mode: 'external',
        required: false,
        available: true,
        fallback: 'deterministic_profile_builder',
        notes: ['Use AIManager when a provider is reachable; otherwise use local deterministic extraction.'],
      },
      {
        id: 'profile',
        label: 'Build candidate profile',
        mode: 'local',
        required: true,
        available: true,
        notes: ['Persist a typed profile and attach extraction confidence to parse metadata.'],
      },
      {
        id: 'clarify',
        label: 'Prepare clarification state',
        mode: 'local',
        required: false,
        available: true,
        notes: ['Ask the user directly about missing or ambiguous resume facts.'],
      },
    ],
  };
}

function stageSnapshot(input: ResumePipelineStageSnapshot): ResumePipelineStageSnapshot {
  return input;
}

export async function runLocalResumePipeline(
  source: ResumePipelineSource,
  services: ResumePipelineServices = {},
): Promise<ResumePipelineRunResult> {
  const vectorStore = services.vectorStore || createResumeVectorStoreFromEnv();
  const embeddingProvider = services.embeddingProvider || createDefaultLocalResumeEmbeddingProvider();
  const plan = createResumePipelinePlan(source, {
    enableVectorStore: vectorStore.isEnabled(),
    useExternalEmbeddings: embeddingProvider.requiresApiKey,
  });
  const stages: ResumePipelineStageSnapshot[] = [];
  stages.push(stageSnapshot({
    id: 'ingest',
    status: plan.sourceKind === 'unknown' ? 'warning' : 'ok',
    mode: 'local',
    label: 'Validate resume source',
    detail: plan.sourceKind,
  }));

  const parseStartedAt = Date.now();
  const parsed = await parseResumeWithLocalAdapter(source);
  stages.push(stageSnapshot({
    id: 'parse',
    status: parsed.metadata.needsManualRecovery ? 'warning' : 'ok',
    mode: 'local',
    label: 'Extract text with local parser adapters',
    itemCount: parsed.metadata.wordCount,
    durationMs: Date.now() - parseStartedAt,
    detail: parsed.metadata.extractionMethod,
  }));

  const chunkStartedAt = Date.now();
  const { sections, chunks } = chunkResumeDocument(parsed);
  stages.push(stageSnapshot({
    id: 'normalize',
    status: sections.length ? 'ok' : 'warning',
    mode: 'local',
    label: 'Normalize resume sections',
    itemCount: sections.length,
    durationMs: Date.now() - chunkStartedAt,
    detail: sections.map((section) => section.kind).join(', '),
  }));
  stages.push(stageSnapshot({
    id: 'chunk',
    status: chunks.length ? 'ok' : 'warning',
    mode: 'local',
    label: 'Create section-aware resume chunks',
    itemCount: chunks.length,
    durationMs: Date.now() - chunkStartedAt,
    detail: `${sections.length} section(s) detected`,
  }));

  const embedStartedAt = Date.now();
  const embeddedChunks = await embedResumeChunks(chunks, embeddingProvider);
  const actualEmbedding = embeddedChunks[0]?.embedding;
  stages.push(stageSnapshot({
    id: 'embed',
    status: actualEmbedding?.mode === 'local_keyword_hash' && embeddingProvider.mode === 'local_transformers' ? 'warning' : 'ok',
    mode: actualEmbedding?.mode === 'external_embedding' ? 'external' : 'local',
    label: 'Embed chunks with local feature extraction',
    itemCount: embeddedChunks.length,
    durationMs: Date.now() - embedStartedAt,
    detail: actualEmbedding?.model || embeddingProvider.id,
    error: embeddingProvider.fallbackReason,
  }));

  const storeStartedAt = Date.now();
  const vectorWrite = vectorStore.isEnabled()
    ? await (async () => {
      try {
        await vectorStore.ensureCollection(actualEmbedding?.dimensions || embeddingProvider.dimensions);
        return await vectorStore.upsert(embeddedChunks.map(resumeChunkToVectorPoint));
      } catch (error) {
        return {
          ok: false,
          count: 0,
          error: error instanceof Error ? error.message : String(error ?? 'Qdrant vector write failed.'),
        };
      }
    })()
    : await vectorStore.upsert([]);
  stages.push(stageSnapshot({
    id: 'store',
    status: vectorWrite.ok ? (vectorWrite.skipped ? 'skipped' : 'ok') : 'failed',
    mode: vectorStore.isEnabled() ? 'external' : 'disabled',
    label: 'Store vectors in Qdrant-compatible backend',
    itemCount: vectorWrite.count,
    durationMs: Date.now() - storeStartedAt,
    detail: vectorStore.id,
    error: vectorWrite.error,
  }));

  return {
    plan,
    stages,
    embeddingProvider: {
      id: embeddingProvider.id,
      mode: actualEmbedding?.mode || embeddingProvider.mode,
      dimensions: actualEmbedding?.dimensions || embeddingProvider.dimensions,
      fallbackReason: embeddingProvider.fallbackReason,
    },
    vectorStore: {
      enabled: vectorStore.isEnabled(),
      kind: vectorStore.kind,
      id: vectorStore.id,
    },
    parsed,
    sections,
    chunks,
    embeddedChunks,
    vectorWrite,
  };
}

export function buildResumePipelineMetadata(
  result: ResumePipelineRunResult,
  profileBuild?: {
    analysis?: {
      confidence?: number;
      needsClarification?: boolean;
      clarificationQuestions?: Array<{ id?: string; reason?: string }>;
      extractionIssues?: string[];
    };
    extractionMetadata?: {
      mode?: 'ai_manager' | 'deterministic_fallback';
      provider?: string;
      model?: string;
      error?: string;
    };
  },
): ResumePipelineMetadata {
  const chunksBySection = new Map<string, number>();
  for (const chunk of result.chunks) {
    chunksBySection.set(chunk.sectionId, (chunksBySection.get(chunk.sectionId) || 0) + 1);
  }

  const questions = profileBuild?.analysis?.clarificationQuestions || [];
  const parseReasons = [
    ...result.parsed.metadata.issues,
    ...result.parsed.metadata.warnings,
  ];
  const profileReasons = [
    ...(profileBuild?.analysis?.extractionIssues || []),
    ...questions.map((question) => question.reason || '').filter(Boolean),
  ];
  const needsClarification = Boolean(
    profileBuild?.analysis?.needsClarification ||
    result.parsed.metadata.needsManualRecovery ||
    questions.length > 0,
  );
  const profileStages: ResumePipelineStageSnapshot[] = profileBuild
    ? [
        {
          id: 'extract',
          status: profileBuild.extractionMetadata?.mode === 'deterministic_fallback' ? 'warning' : 'ok',
          mode: profileBuild.extractionMetadata?.mode === 'ai_manager' ? 'external' : 'local',
          label: 'Extract structured resume fields',
          detail: profileBuild.extractionMetadata?.provider || profileBuild.extractionMetadata?.mode,
          error: profileBuild.extractionMetadata?.error,
        },
        {
          id: 'profile',
          status: 'ok',
          mode: 'local',
          label: 'Build candidate profile',
          detail: `confidence ${profileBuild.analysis?.confidence ?? 'unknown'}`,
        },
        {
          id: 'clarify',
          status: needsClarification ? 'warning' : 'ok',
          mode: 'local',
          label: 'Prepare clarification state',
          itemCount: questions.length,
          detail: needsClarification ? 'clarification_needed' : 'no_clarification_needed',
        },
      ]
    : [
        {
          id: 'extract',
          status: 'skipped',
          mode: 'external',
          label: 'Extract structured resume fields',
          detail: 'profile generation has not run yet',
        },
        {
          id: 'profile',
          status: 'skipped',
          mode: 'local',
          label: 'Build candidate profile',
          detail: 'profile generation has not run yet',
        },
        {
          id: 'clarify',
          status: needsClarification ? 'warning' : 'skipped',
          mode: 'local',
          label: 'Prepare clarification state',
          itemCount: questions.length,
          detail: needsClarification ? 'parser flagged recovery need' : 'profile generation has not run yet',
        },
      ];

  return {
    version: 'phase-2',
    generatedAt: new Date().toISOString(),
    sourceKind: result.parsed.sourceKind,
    stages: [...result.stages, ...profileStages],
    parser: result.parsed.metadata,
    sections: result.sections.map((section) => ({
      id: section.id,
      kind: section.kind,
      title: section.title,
      characterCount: section.text.length,
      chunkCount: chunksBySection.get(section.id) || 0,
    })),
    chunkCount: result.chunks.length,
    embedding: {
      provider: result.embeddingProvider.id,
      mode: result.embeddingProvider.mode,
      model: result.embeddedChunks[0]?.embedding.model || result.embeddingProvider.id,
      dimensions: result.embeddingProvider.dimensions,
      chunkCount: result.embeddedChunks.length,
      fallbackReason: result.embeddingProvider.fallbackReason,
    },
    vectorStore: {
      ...result.vectorStore,
      write: result.vectorWrite,
    },
    clarification: {
      needsClarification,
      questionCount: questions.length,
      questionIds: questions.map((question, index) => question.id || `clarification_${index + 1}`),
      reasons: Array.from(new Set([...parseReasons, ...profileReasons].filter(Boolean))).slice(0, 8),
    },
    profileBuilder: profileBuild
      ? {
          status: profileBuild.extractionMetadata?.mode === 'deterministic_fallback' ? 'fallback' : 'completed',
          mode: profileBuild.extractionMetadata?.mode,
          provider: profileBuild.extractionMetadata?.provider,
          model: profileBuild.extractionMetadata?.model,
          confidence: profileBuild.analysis?.confidence,
          error: profileBuild.extractionMetadata?.error,
        }
      : {
          status: 'not_started',
        },
  };
}
