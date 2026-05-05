import path from 'path';
import {
  parseResumeFileWithMetadata,
  probeResumeExtractionCapabilities,
} from '../resume-parser';
import type {
  ResumeFileKind,
  ResumeParsedDocument,
  ResumeParserAdapterId,
  ResumeParserAdapterPlan,
  ResumePipelineSource,
} from './types';

function normalizeMime(value: string | undefined) {
  return (value || '').toLowerCase();
}

export function inferResumeFileKind(source: ResumePipelineSource): ResumeFileKind {
  if (source.text?.trim()) return 'text';

  const mimeType = normalizeMime(source.mimeType);
  const ext = path.extname(source.filename || source.filePath || '').toLowerCase();

  if (mimeType === 'application/pdf' || ext === '.pdf') return 'pdf';
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ext === '.docx'
  ) {
    return 'docx';
  }

  return 'unknown';
}

export function getResumeParserAdapterPlan(): ResumeParserAdapterPlan[] {
  const capabilities = probeResumeExtractionCapabilities();

  return [
    {
      id: 'existing_pdf_parse',
      label: 'PDF text extraction with pdf-parse',
      fileKinds: ['pdf'],
      stage: 'primary',
      isAvailable: true,
      isFallback: false,
      requires: ['pdf-parse dependency'],
      notes: [
        'Primary local PDF parser already used by src/lib/services/resume-parser.ts.',
        'Does not require an AI API key.',
      ],
    },
    {
      id: 'poppler_layout_text',
      label: 'PDF layout recovery with pdftotext',
      fileKinds: ['pdf'],
      stage: 'layout_recovery',
      isAvailable: capabilities.pdftotext,
      isFallback: true,
      requires: ['Poppler pdftotext CLI'],
      notes: [
        'Use when native PDF text order looks weak or two-column layouts are suspected.',
        'The existing parser already attempts this when pdftotext is available.',
      ],
    },
    {
      id: 'tesseract_ocr',
      label: 'PDF OCR recovery with pdftoppm and tesseract',
      fileKinds: ['pdf'],
      stage: 'ocr_recovery',
      isAvailable: capabilities.pdftoppm && capabilities.tesseract,
      isFallback: true,
      requires: ['Poppler pdftoppm CLI', 'Tesseract CLI'],
      notes: [
        'Use only after low-confidence extraction, scanned PDF detection, or manual recovery warning.',
        'OCR remains local and non-AI.',
      ],
    },
    {
      id: 'mammoth_docx',
      label: 'DOCX raw text extraction with mammoth',
      fileKinds: ['docx'],
      stage: 'primary',
      isAvailable: true,
      isFallback: false,
      requires: ['mammoth dependency'],
      notes: [
        'Primary local DOCX parser already used by src/lib/services/resume-parser.ts.',
        'Does not require an AI API key.',
      ],
    },
    {
      id: 'manual_text',
      label: 'Manual pasted resume text',
      fileKinds: ['text', 'pdf', 'docx', 'unknown'],
      stage: 'manual_recovery',
      isAvailable: true,
      isFallback: true,
      requires: [],
      notes: [
        'Safe fallback when binary extraction is too weak to trust.',
        'Preserves the no-API-key path for onboarding and local RAG setup.',
      ],
    },
  ];
}

export function selectPrimaryParserAdapter(source: ResumePipelineSource): ResumeParserAdapterPlan | null {
  const kind = inferResumeFileKind(source);
  const adapters = getResumeParserAdapterPlan();

  if (kind === 'text') {
    return adapters.find((adapter) => adapter.id === 'manual_text') || null;
  }

  return adapters.find((adapter) =>
    adapter.fileKinds.includes(kind) &&
    adapter.stage === 'primary' &&
    adapter.isAvailable
  ) || null;
}

function parserIdForKind(kind: ResumeFileKind): ResumeParserAdapterId {
  if (kind === 'pdf') return 'existing_pdf_parse';
  if (kind === 'docx') return 'mammoth_docx';
  return 'manual_text';
}

function countWords(text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized ? normalized.split(' ').length : 0;
}

export async function parseResumeWithLocalAdapter(source: ResumePipelineSource): Promise<ResumeParsedDocument> {
  const sourceKind = inferResumeFileKind(source);

  if (source.text?.trim()) {
    const text = source.text.trim();
    return {
      source,
      sourceKind: 'text',
      text,
      metadata: {
        parserId: 'manual_text',
        extractionMethod: 'manual-text',
        characterCount: text.length,
        wordCount: countWords(text),
        confidence: text.length >= 500 ? 90 : 45,
        issues: text.length >= 500 ? [] : ['Manual resume text is short and may be incomplete.'],
        warnings: [],
        needsManualRecovery: text.length < 500,
      },
    };
  }

  if (!source.filePath) {
    throw new Error('Resume pipeline source requires filePath or text.');
  }

  if (sourceKind !== 'pdf' && sourceKind !== 'docx') {
    throw new Error('Resume pipeline supports PDF, DOCX, or manual text sources.');
  }

  let parsed;
  try {
    parsed = await parseResumeFileWithMetadata(source.filePath, source.mimeType || '');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || 'Resume parsing failed.');
    return {
      source,
      sourceKind,
      text: '',
      metadata: {
        parserId: parserIdForKind(sourceKind),
        extractionMethod: 'manual-recovery',
        characterCount: 0,
        wordCount: 0,
        confidence: 0,
        issues: [
          'Career Seek could not safely extract text from this resume.',
          'Paste the resume text manually so profile generation does not guess.',
        ],
        warnings: [message.slice(0, 240)],
        needsManualRecovery: true,
        original: {
          fileType: sourceKind,
          characterCount: 0,
          wordCount: 0,
          extractionMethod: sourceKind === 'pdf' ? 'pdf-parse' : 'mammoth',
          confidence: 0,
          issues: ['Parser exception was caught and converted to manual recovery.'],
          warnings: [message.slice(0, 240)],
          needsManualRecovery: true,
          recoveryMessage: 'We could not read enough reliable text from the file. Paste the resume text manually to continue safely.',
          ocrInstallHint: sourceKind === 'pdf' ? 'For scanned PDFs, install local OCR helpers or export a text-based PDF/DOCX.' : undefined,
        },
      },
    };
  }

  return {
    source,
    sourceKind,
    text: parsed.text,
    metadata: {
      parserId: parserIdForKind(sourceKind),
      extractionMethod: parsed.metadata.extractionMethod,
      characterCount: parsed.metadata.characterCount,
      wordCount: parsed.metadata.wordCount,
      confidence: parsed.metadata.confidence,
      issues: parsed.metadata.issues,
      warnings: parsed.metadata.warnings,
      needsManualRecovery: Boolean(parsed.metadata.needsManualRecovery),
      original: parsed.metadata,
    },
  };
}
