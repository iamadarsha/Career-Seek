export type ResumeFileKind = 'pdf' | 'docx' | 'text' | 'unknown';

export type ResumePipelineStageId =
  | 'ingest'
  | 'parse'
  | 'normalize'
  | 'chunk'
  | 'embed'
  | 'store'
  | 'extract'
  | 'profile'
  | 'clarify';

export type ResumeParserAdapterId =
  | 'existing_pdf_parse'
  | 'poppler_layout_text'
  | 'tesseract_ocr'
  | 'mammoth_docx'
  | 'manual_text';

export type ResumeEmbeddingMode =
  | 'local_keyword_hash'
  | 'local_transformers'
  | 'external_embedding'
  | 'disabled';

export type ResumeVectorStoreKind =
  | 'qdrant'
  | 'disabled';

export type ResumeSectionKind =
  | 'header'
  | 'summary'
  | 'skills'
  | 'experience'
  | 'projects'
  | 'education'
  | 'certifications'
  | 'achievements'
  | 'other';

export interface ResumePipelineSource {
  resumeId?: number | string;
  filename?: string;
  filePath?: string;
  mimeType?: string;
  text?: string;
}

export interface ResumePipelineStagePlan {
  id: ResumePipelineStageId;
  label: string;
  mode: 'local' | 'external' | 'disabled';
  required: boolean;
  available: boolean;
  fallback?: string;
  notes: string[];
}

export interface ResumePipelineStageSnapshot {
  id: ResumePipelineStageId;
  status: 'ok' | 'warning' | 'skipped' | 'failed';
  mode: 'local' | 'external' | 'disabled';
  label: string;
  itemCount?: number;
  durationMs?: number;
  detail?: string;
  error?: string;
}

export interface ResumePipelinePlan {
  sourceKind: ResumeFileKind;
  stages: ResumePipelineStagePlan[];
  parserAdapters: ResumeParserAdapterPlan[];
  warnings: string[];
}

export interface ResumeParserAdapterPlan {
  id: ResumeParserAdapterId;
  label: string;
  fileKinds: ResumeFileKind[];
  stage: 'primary' | 'layout_recovery' | 'ocr_recovery' | 'manual_recovery';
  isAvailable: boolean;
  isFallback: boolean;
  requires: string[];
  notes: string[];
}

export interface ResumeParsedDocument {
  source: ResumePipelineSource;
  sourceKind: ResumeFileKind;
  text: string;
  metadata: {
    parserId: ResumeParserAdapterId;
    extractionMethod: string;
    characterCount: number;
    wordCount: number;
    confidence: number;
    issues: string[];
    warnings: string[];
    needsManualRecovery: boolean;
    original?: unknown;
  };
}

export interface ResumeNormalizedSection {
  id: string;
  kind: ResumeSectionKind;
  title: string;
  text: string;
  order: number;
}

export interface ResumeChunk {
  id: string;
  resumeId: string;
  sectionId: string;
  sectionKind: ResumeSectionKind;
  sectionTitle: string;
  ordinal: number;
  text: string;
  tokenEstimate: number;
  metadata: Record<string, string | number | boolean | null>;
}

export interface ResumeEmbedding {
  chunkId: string;
  vector: number[];
  dimensions: number;
  model: string;
  mode: ResumeEmbeddingMode;
}

export interface ResumeEmbeddedChunk extends ResumeChunk {
  embedding: ResumeEmbedding;
}

export interface ResumeEmbeddingProvider {
  id: string;
  mode: ResumeEmbeddingMode;
  dimensions: number;
  requiresApiKey: boolean;
  fallbackReason?: string;
  embed(texts: string[]): Promise<ResumeEmbedding[]>;
}

export interface ResumeVectorPoint {
  id: string;
  vector: number[];
  payload: Record<string, unknown>;
}

export interface ResumeVectorSearchRequest {
  vector: number[];
  limit: number;
  filter?: Record<string, unknown>;
  scoreThreshold?: number;
}

export interface ResumeVectorSearchResult {
  id: string;
  score: number;
  payload: Record<string, unknown>;
}

export interface ResumeVectorWriteResult {
  ok: boolean;
  count: number;
  skipped?: boolean;
  error?: string;
}

export interface ResumeVectorStoreClient {
  id: string;
  kind: ResumeVectorStoreKind;
  isEnabled(): boolean;
  ensureCollection(dimensions: number): Promise<ResumeVectorWriteResult>;
  upsert(points: ResumeVectorPoint[]): Promise<ResumeVectorWriteResult>;
  search(request: ResumeVectorSearchRequest): Promise<ResumeVectorSearchResult[]>;
  deleteByFilter(filter: Record<string, unknown>): Promise<ResumeVectorWriteResult>;
}

export interface ResumePipelineRunResult {
  plan: ResumePipelinePlan;
  stages: ResumePipelineStageSnapshot[];
  embeddingProvider: {
    id: string;
    mode: ResumeEmbeddingMode;
    dimensions: number;
    fallbackReason?: string;
  };
  vectorStore: {
    enabled: boolean;
    kind: ResumeVectorStoreKind;
    id: string;
  };
  parsed: ResumeParsedDocument;
  sections: ResumeNormalizedSection[];
  chunks: ResumeChunk[];
  embeddedChunks: ResumeEmbeddedChunk[];
  vectorWrite: ResumeVectorWriteResult;
}

export interface ResumePipelineMetadata {
  version: 'phase-2';
  generatedAt: string;
  sourceKind: ResumeFileKind;
  stages: ResumePipelineStageSnapshot[];
  parser: ResumeParsedDocument['metadata'];
  sections: Array<{
    id: string;
    kind: ResumeSectionKind;
    title: string;
    characterCount: number;
    chunkCount: number;
  }>;
  chunkCount: number;
  embedding: {
    provider: string;
    mode: ResumeEmbeddingMode;
    model: string;
    dimensions: number;
    chunkCount: number;
    fallbackReason?: string;
  };
  vectorStore: {
    enabled: boolean;
    kind: ResumeVectorStoreKind;
    id: string;
    write: ResumeVectorWriteResult;
  };
  clarification: {
    needsClarification: boolean;
    questionCount: number;
    questionIds: string[];
    reasons: string[];
  };
  profileBuilder?: {
    status: 'not_started' | 'completed' | 'fallback';
    mode?: 'ai_manager' | 'deterministic_fallback';
    provider?: string;
    model?: string;
    confidence?: number;
    error?: string;
  };
}
