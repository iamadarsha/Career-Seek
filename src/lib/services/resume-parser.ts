import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

export interface ResumeParseMetadata {
  fileType: 'pdf' | 'docx';
  pages?: number;
  characterCount: number;
  wordCount: number;
  extractionMethod: 'pdf-parse' | 'mammoth';
  confidence: number;
  issues: string[];
  warnings: string[];
  needsManualRecovery?: boolean;
  requiresOcr?: boolean;
  recoveryMessage?: string;
  ocrInstallHint?: string;
  flags?: {
    isProbablyScanned: boolean;
    lowTextDensity: boolean;
    layoutRisk: boolean;
    glyphCorruptionRisk: boolean;
    weakDateSignals: boolean;
  };
  capabilities?: ResumeExtractionCapabilities;
  ocr?: {
    attempted: boolean;
    available: boolean;
    succeeded: boolean;
    characterCount: number;
    error?: string;
  };
}

export interface ResumeExtractionCapabilities {
  pdftoppm: boolean;
  tesseract: boolean;
  pdfinfo: boolean;
  pdftotext: boolean;
  paddleOcrPython: boolean;
}

export interface ResumeParseResult {
  text: string;
  metadata: ResumeParseMetadata;
}

function ocrInstallHint() {
  if (process.platform === 'darwin') return 'Install local OCR helpers with: brew install poppler tesseract';
  if (process.platform === 'win32') return 'Install Poppler for Windows and Tesseract OCR, then add both bin folders to PATH.';
  return 'Install local OCR helpers with your package manager, for example: sudo apt-get install poppler-utils tesseract-ocr';
}

function inspectExtractedText(text: string, fileType: 'pdf' | 'docx', pages?: number): ResumeParseMetadata {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const issues: string[] = [];
  const warnings: string[] = [];

  const isProbablyScanned = fileType === 'pdf' && normalized.length < 300;
  const lowTextDensity = Boolean(pages && normalized.length / Math.max(1, pages) < 450);

  if (normalized.length < 500) {
    issues.push('Very little text was extracted. This may be a scanned or image-based resume.');
  }

  if (lowTextDensity) {
    warnings.push('Low text density per page suggests OCR or extraction weakness.');
  }

  const dateLike = normalized.match(/\b(20\d{2}|19\d{2}|present|current|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/gi) || [];
  const dateRanges = normalized.match(/\b((jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+)?(19|20)\d{2}\s*(-|to|–)\s*(((jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+)?(19|20)\d{2}|present|current)\b/gi) || [];
  const weakDateSignals = dateLike.length < 3 && dateRanges.length < 2;
  if (weakDateSignals) {
    warnings.push('Few date signals were detected, so employment date extraction may be weak.');
  }

  const shortLineRatio = lines.length > 10
    ? lines.filter((line) => line.length < 24).length / lines.length
    : 0;
  const averageLineLength = lines.length
    ? lines.reduce((total, line) => total + line.length, 0) / lines.length
    : 0;
  const layoutRisk = shortLineRatio > 0.45 || (fileType === 'pdf' && lines.length > 12 && averageLineLength < 44);
  if (layoutRisk) {
    warnings.push('Many short lines were detected. Two-column resumes or icon/table layouts may have broken text order.');
  }

  const glyphCorruptionRisk = /(cid:|�|□|●\s*●)/i.test(text);
  if (glyphCorruptionRisk) {
    warnings.push('Some symbols or encoded glyphs were detected and may have corrupted text order.');
  }

  const confidence = Math.max(25, Math.min(96, 92 - issues.length * 25 - warnings.length * 8));

  return {
    fileType,
    pages,
    characterCount: normalized.length,
    wordCount: normalized ? normalized.split(/\s+/).length : 0,
    extractionMethod: fileType === 'pdf' ? 'pdf-parse' : 'mammoth',
    confidence,
    needsManualRecovery: confidence < 45 || normalized.length < 350,
    issues,
    warnings,
    flags: {
      isProbablyScanned,
      lowTextDensity,
      layoutRisk,
      glyphCorruptionRisk,
      weakDateSignals,
    },
  };
}

function commandExists(command: string): boolean {
  try {
    execFileSync('which', [command], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function probeResumeExtractionCapabilities(): ResumeExtractionCapabilities {
  return {
    pdftoppm: commandExists('pdftoppm'),
    tesseract: commandExists('tesseract'),
    pdfinfo: commandExists('pdfinfo'),
    pdftotext: commandExists('pdftotext'),
    paddleOcrPython: commandExists('paddleocr'),
  };
}

function attemptPdfLayoutText(filePath: string): string {
  if (!commandExists('pdftotext')) return '';
  try {
    const output = execFileSync('pdftotext', ['-layout', '-enc', 'UTF-8', filePath, '-'], {
      encoding: 'utf8',
      timeout: 30_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output.trim();
  } catch {
    return '';
  }
}

async function attemptPdfOcr(filePath: string): Promise<{ text: string; metadata: ResumeParseMetadata['ocr'] }> {
  const hasPdftoppm = commandExists('pdftoppm');
  const hasTesseract = commandExists('tesseract');
  if (!hasPdftoppm || !hasTesseract) {
    return {
      text: '',
      metadata: {
        attempted: true,
        available: false,
        succeeded: false,
        characterCount: 0,
        error: 'OCR tools unavailable. Install poppler pdftoppm and tesseract, or upload DOCX / paste resume text.',
      },
    };
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'career-seek-ocr-'));
  const prefix = path.join(tmpDir, 'page');
  try {
    execFileSync('pdftoppm', ['-f', '1', '-l', '3', '-png', '-r', '180', filePath, prefix], { timeout: 45_000 });
    const images = fs.readdirSync(tmpDir)
      .filter((file) => file.endsWith('.png'))
      .map((file) => path.join(tmpDir, file))
      .sort();

    const text = images.map((image) => {
      try {
        return execFileSync('tesseract', [image, 'stdout', '-l', 'eng'], {
          encoding: 'utf8',
          timeout: 45_000,
          stdio: ['ignore', 'pipe', 'ignore'],
        });
      } catch {
        return '';
      }
    }).join('\n\n').trim();

    return {
      text,
      metadata: {
        attempted: true,
        available: true,
        succeeded: text.replace(/\s+/g, '').length >= 300,
        characterCount: text.length,
        error: text.replace(/\s+/g, '').length >= 300 ? undefined : 'OCR produced too little usable text.',
      },
    };
  } catch (error: any) {
    return {
      text: '',
      metadata: {
        attempted: true,
        available: true,
        succeeded: false,
        characterCount: 0,
        error: error.message || 'OCR failed.',
      },
    };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export async function parseResumeFileWithMetadata(filePath: string, mimeType: string): Promise<ResumeParseResult> {
  const ext = path.extname(filePath).toLowerCase();

  if (mimeType === 'application/pdf' || ext === '.pdf') {
    const capabilities = probeResumeExtractionCapabilities();
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    let text = data.text || '';
    let metadata = inspectExtractedText(text, 'pdf', data.numpages);
    metadata.capabilities = capabilities;

    if ((metadata.flags?.layoutRisk || metadata.flags?.weakDateSignals) && capabilities.pdftotext) {
      const layoutText = attemptPdfLayoutText(filePath);
      if (layoutText.length > text.length * 1.1) {
        text = layoutText;
        metadata = {
          ...inspectExtractedText(text, 'pdf', data.numpages),
          capabilities,
          warnings: [
            ...inspectExtractedText(text, 'pdf', data.numpages).warnings,
            'Used Poppler layout extraction because the default PDF text order looked weak.',
          ],
        };
      }
    }

    if (metadata.needsManualRecovery) {
      const ocr = await attemptPdfOcr(filePath);
      metadata.ocr = ocr.metadata;
      if (ocr.metadata?.succeeded && ocr.text.length > text.length) {
        text = ocr.text;
        metadata = {
          ...inspectExtractedText(text, 'pdf', data.numpages),
          capabilities,
          ocr: ocr.metadata,
        };
      } else {
        metadata.needsManualRecovery = true;
        metadata.requiresOcr = true;
        metadata.recoveryMessage = 'This resume appears to be scanned or image-based. Install OCR helpers or paste the resume text manually so Career Seek can avoid guessing.';
        metadata.ocrInstallHint = ocrInstallHint();
        metadata.issues.push('Resume text extraction is too weak to trust for AI profile generation.');
      }
    }

    return {
      text,
      metadata,
    };
  }

  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ext === '.docx'
  ) {
    const result = await mammoth.extractRawText({ path: filePath });
    const text = result.value || '';
    const metadata = inspectExtractedText(text, 'docx');
    metadata.capabilities = probeResumeExtractionCapabilities();
    if (result.messages?.length) {
      metadata.warnings.push(...result.messages.map((message) => message.message));
      metadata.confidence = Math.max(25, metadata.confidence - result.messages.length * 4);
    }
    return { text, metadata };
  }

  throw new Error('Unsupported file format. Please upload a PDF or DOCX file.');
}

export async function parseResumeFile(filePath: string, mimeType: string): Promise<string> {
  const result = await parseResumeFileWithMetadata(filePath, mimeType);
  return result.text;
}
