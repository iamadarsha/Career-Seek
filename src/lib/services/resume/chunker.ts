import crypto from 'crypto';
import type {
  ResumeChunk,
  ResumeNormalizedSection,
  ResumeParsedDocument,
  ResumeSectionKind,
} from './types';

const DEFAULT_MAX_CHARS = 1800;
const DEFAULT_OVERLAP_CHARS = 220;

const SECTION_RULES: Array<{ kind: ResumeSectionKind; title: string; pattern: RegExp }> = [
  { kind: 'summary', title: 'Summary', pattern: /^(summary|professional summary|profile|objective)$/i },
  { kind: 'skills', title: 'Skills', pattern: /^(skills|technical skills|core competencies|competencies|tools)$/i },
  { kind: 'experience', title: 'Experience', pattern: /^(experience|work experience|professional experience|employment history)$/i },
  { kind: 'projects', title: 'Projects', pattern: /^(projects|selected projects|project experience)$/i },
  { kind: 'education', title: 'Education', pattern: /^(education|academic background)$/i },
  { kind: 'certifications', title: 'Certifications', pattern: /^(certifications|certificates|licenses)$/i },
  { kind: 'achievements', title: 'Achievements', pattern: /^(achievements|awards|honors|publications)$/i },
];

export interface ResumeChunkOptions {
  maxChars?: number;
  overlapChars?: number;
}

function hashId(parts: Array<string | number | undefined>) {
  return crypto
    .createHash('sha256')
    .update(parts.filter((part) => part !== undefined).join(':'))
    .digest('hex')
    .slice(0, 24);
}

function normalizeWhitespace(text: string) {
  return text.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function cleanHeading(line: string) {
  return line
    .replace(/^[#*\-\s]+/, '')
    .replace(/[:\-]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchSectionHeading(line: string) {
  const cleaned = cleanHeading(line);
  if (!cleaned || cleaned.length > 64 || /[.!?]$/.test(cleaned)) return null;
  return SECTION_RULES.find((rule) => rule.pattern.test(cleaned)) || null;
}

function estimateTokens(text: string) {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.ceil(words * 1.3);
}

function resolveResumeId(document: ResumeParsedDocument) {
  const explicit = document.source.resumeId;
  if (explicit !== undefined) return String(explicit);
  return hashId([
    document.source.filename,
    document.source.filePath,
    document.metadata.characterCount,
    document.text.slice(0, 120),
  ]);
}

export function normalizeResumeSections(document: ResumeParsedDocument): ResumeNormalizedSection[] {
  const text = normalizeWhitespace(document.text);
  if (!text) return [];

  const resumeId = resolveResumeId(document);
  const lines = text.split('\n');
  const sections: ResumeNormalizedSection[] = [];
  let current: {
    kind: ResumeSectionKind;
    title: string;
    lines: string[];
  } = {
    kind: 'header',
    title: 'Header',
    lines: [],
  };

  const pushCurrent = () => {
    const sectionText = normalizeWhitespace(current.lines.join('\n'));
    if (!sectionText) return;
    sections.push({
      id: hashId([resumeId, current.title, sections.length, sectionText.slice(0, 80)]),
      kind: current.kind,
      title: current.title,
      text: sectionText,
      order: sections.length,
    });
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const heading = matchSectionHeading(line);

    if (heading) {
      pushCurrent();
      current = {
        kind: heading.kind,
        title: heading.title,
        lines: [],
      };
      continue;
    }

    current.lines.push(rawLine);
  }

  pushCurrent();

  if (sections.length === 0) {
    return [{
      id: hashId([resumeId, 'full_resume', text.slice(0, 80)]),
      kind: 'other',
      title: 'Full Resume',
      text,
      order: 0,
    }];
  }

  return sections;
}

function splitSectionText(text: string, maxChars: number, overlapChars: number) {
  if (text.length <= maxChars) return [text];

  const paragraphs = text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }

    if (current) chunks.push(current);

    if (paragraph.length <= maxChars) {
      current = paragraph;
      continue;
    }

    for (let start = 0; start < paragraph.length; start += Math.max(1, maxChars - overlapChars)) {
      chunks.push(paragraph.slice(start, start + maxChars).trim());
    }
    current = '';
  }

  if (current) chunks.push(current);
  return chunks.filter(Boolean);
}

export function chunkResumeDocument(
  document: ResumeParsedDocument,
  options: ResumeChunkOptions = {},
): { sections: ResumeNormalizedSection[]; chunks: ResumeChunk[] } {
  const maxChars = options.maxChars || DEFAULT_MAX_CHARS;
  const overlapChars = Math.min(options.overlapChars || DEFAULT_OVERLAP_CHARS, Math.floor(maxChars / 3));
  const resumeId = resolveResumeId(document);
  const sections = normalizeResumeSections(document);
  const chunks: ResumeChunk[] = [];

  for (const section of sections) {
    const pieces = splitSectionText(section.text, maxChars, overlapChars);
    pieces.forEach((piece, index) => {
      const id = hashId([resumeId, section.id, index, piece.slice(0, 120)]);
      chunks.push({
        id,
        resumeId,
        sectionId: section.id,
        sectionKind: section.kind,
        sectionTitle: section.title,
        ordinal: chunks.length,
        text: piece,
        tokenEstimate: estimateTokens(piece),
        metadata: {
          sourceKind: document.sourceKind,
          filename: document.source.filename || null,
          parserId: document.metadata.parserId,
          sectionOrder: section.order,
          sectionChunkIndex: index,
          needsManualRecovery: document.metadata.needsManualRecovery,
        },
      });
    });
  }

  return { sections, chunks };
}
