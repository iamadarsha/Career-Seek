import { Document, Paragraph, TextRun, Packer, AlignmentType, BorderStyle } from 'docx';
import { TailoredResume } from './resume-tailor';
import * as fs from 'fs';
import * as path from 'path';
import { getAppSubDir } from '../../local-paths';

export interface ResumeDocumentOptions {
  version?: number;
  company?: string;
  title?: string;
}

function safeSlug(value: string | undefined, fallback: string) {
  return (value || fallback).replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 48) || fallback;
}

function compactText(values: Array<string | undefined | null>, separator: string) {
  return values.map((value) => String(value || '').trim()).filter(Boolean).join(separator);
}

function tr(options: ConstructorParameters<typeof TextRun>[0]) {
  return new TextRun({ font: 'Calibri', ...(options as any) });
}

/** Horizontal rule paragraph using a bottom border */
function hrParagraph() {
  return new Paragraph({
    border: { bottom: { color: 'BFBFBF', style: BorderStyle.SINGLE, size: 6, space: 1 } },
    spacing: { before: 0, after: 80 },
    children: [],
  });
}

function sectionHeading(text: string) {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    children: [tr({ text: text.toUpperCase(), bold: true, size: 22, color: '1F2937' })],
    spacing: { before: 240, after: 60 },
    border: { bottom: { color: 'BFBFBF', style: BorderStyle.SINGLE, size: 6, space: 1 } },
  });
}

export async function buildResumeDocx(resume: TailoredResume, jobId: number, options: ResumeDocumentOptions = {}): Promise<string> {
  const children: any[] = [];

  // ── Header: Name ──
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [tr({ text: resume.fullName, bold: true, size: 40, color: '0F172A' })],
      spacing: { before: 0, after: 80 },
    }),
  );

  // ── Header: Headline ──
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [tr({ text: resume.headline, size: 22, color: '374151' })],
      spacing: { after: 80 },
    }),
  );

  // ── Header: Contact line ──
  if (resume.contact) {
    const { location, phone, email, linkedin } = resume.contact;
    const parts = [location, phone, email, linkedin].filter(Boolean);
    if (parts.length) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [tr({ text: parts.join(' | '), size: 18, color: '6B7280' })],
          spacing: { after: 80 },
        }),
      );
    }
  }

  children.push(hrParagraph());

  // ── Professional Summary ──
  children.push(sectionHeading('Professional Summary'));
  children.push(
    new Paragraph({
      children: [tr({ text: resume.summary, size: 20 })],
      spacing: { before: 100, after: 160 },
    }),
  );

  // ── Core Competencies (categorized if available, else flat) ──
  children.push(sectionHeading('Core Competencies & Technical Skills'));
  const cats = resume.skillCategories?.filter((c) => c.skills.length);
  if (cats?.length) {
    for (const cat of cats) {
      children.push(
        new Paragraph({
          children: [
            tr({ text: `${cat.category}: `, bold: true, size: 20 }),
            tr({ text: cat.skills.join(', '), size: 20 }),
          ],
          spacing: { before: 60, after: 60 },
        }),
      );
    }
    children.push(new Paragraph({ children: [], spacing: { after: 100 } }));
  } else {
    const flat = [...(resume.skills ?? []), ...(resume.tools ?? [])];
    if (flat.length) {
      children.push(
        new Paragraph({
          children: [tr({ text: flat.join(' • '), size: 20 })],
          spacing: { before: 100, after: 160 },
        }),
      );
    }
  }

  // ── Professional Experience ──
  children.push(sectionHeading('Professional Experience'));
  for (const exp of resume.experience) {
    // Role line
    children.push(
      new Paragraph({
        children: [tr({ text: exp.role, bold: true, size: 22, color: '111827' })],
        spacing: { before: 160, after: 40 },
      }),
    );
    // Company + location + duration on one line
    const metaLine = compactText([exp.company, exp.location ? `| ${exp.location}` : '', exp.duration ? exp.duration : ''], '  ');
    if (metaLine) {
      children.push(
        new Paragraph({
          children: [tr({ text: metaLine, italics: true, size: 19, color: '6B7280' })],
          spacing: { after: 60 },
        }),
      );
    }
    for (const bullet of exp.bullets) {
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          children: [tr({ text: bullet, size: 20 })],
          spacing: { after: 60 },
        }),
      );
    }
  }

  // ── Key Projects ──
  if (resume.projects?.length) {
    children.push(sectionHeading('Key Projects'));
    for (const proj of resume.projects) {
      const projTitle = proj.description ? `${proj.name} — ${proj.description}` : proj.name;
      children.push(
        new Paragraph({
          children: [tr({ text: projTitle, bold: true, size: 21, color: '111827' })],
          spacing: { before: 140, after: 40 },
        }),
      );
      if (proj.technologies?.length) {
        children.push(
          new Paragraph({
            children: [
              tr({ text: 'Technologies: ', bold: true, size: 19, color: '374151' }),
              tr({ text: proj.technologies.join(', '), size: 19, color: '374151' }),
            ],
            spacing: { after: 40 },
          }),
        );
      }
      for (const bullet of proj.bullets) {
        children.push(
          new Paragraph({
            bullet: { level: 0 },
            children: [tr({ text: bullet, size: 20 })],
            spacing: { after: 60 },
          }),
        );
      }
    }
  }

  // ── Education ──
  if (resume.education && resume.education.length > 0) {
    children.push(sectionHeading('Education'));
    for (const edu of resume.education) {
      const degLine = compactText([edu.degree, edu.year], '  ');
      children.push(
        new Paragraph({
          children: [tr({ text: degLine, bold: true, size: 21 })],
          spacing: { before: 120, after: 40 },
        }),
      );
      const instLine = compactText([edu.institution, edu.description], ' | ');
      if (instLine) {
        children.push(
          new Paragraph({
            children: [tr({ text: instLine, size: 19, italics: true, color: '6B7280' })],
            spacing: { after: 60 },
          }),
        );
      }
    }
  }

  // ── Certifications & Recognition ──
  if (resume.certifications?.length) {
    children.push(sectionHeading('Certifications & Recognition'));
    for (const cert of resume.certifications) {
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          children: [tr({ text: cert, size: 20 })],
          spacing: { after: 60 },
        }),
      );
    }
  }

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 20 } },
      },
    },
    sections: [{ properties: { page: { margin: { top: 720, right: 864, bottom: 720, left: 864 } } }, children }],
  });

  const buffer = await Packer.toBuffer(doc);
  const dir = getAppSubDir('output/resumes');
  const filename = `resume_${safeSlug(options.company, 'company')}_${safeSlug(options.title, 'role')}_job_${jobId}_v${options.version || 1}_${Date.now()}.docx`;
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

function escapePdfText(text: string) {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function escapeHtml(text: string) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function wrapLine(text: string, max = 92) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length > max) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = `${current} ${word}`.trim();
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function resumeLines(resume: TailoredResume) {
  const lines: string[] = [];

  lines.push(resume.fullName);
  lines.push(resume.headline);
  if (resume.contact) {
    const { location, phone, email, linkedin } = resume.contact;
    const contactLine = [location, phone, email, linkedin].filter(Boolean).join(' | ');
    if (contactLine) lines.push(contactLine);
  }
  lines.push('');

  lines.push('PROFESSIONAL SUMMARY');
  lines.push(...wrapLine(resume.summary));
  lines.push('');

  lines.push('CORE COMPETENCIES AND TECHNICAL SKILLS');
  const cats = resume.skillCategories?.filter((c) => c.skills.length);
  if (cats?.length) {
    for (const cat of cats) {
      lines.push(`${cat.category}: ${cat.skills.join(', ')}`);
    }
  } else {
    const flat = [...(resume.skills ?? []), ...(resume.tools ?? [])];
    if (flat.length) lines.push(...wrapLine(flat.join(', ')));
  }
  lines.push('');

  lines.push('PROFESSIONAL EXPERIENCE');
  for (const exp of resume.experience || []) {
    lines.push(exp.role);
    const meta = compactText([exp.company, exp.location ? `| ${exp.location}` : '', exp.duration], '  ');
    if (meta) lines.push(meta);
    for (const bullet of exp.bullets || []) {
      lines.push(...wrapLine(`- ${bullet}`, 88));
    }
    lines.push('');
  }

  if (resume.projects?.length) {
    lines.push('KEY PROJECTS');
    for (const proj of resume.projects) {
      const title = proj.description ? `${proj.name} — ${proj.description}` : proj.name;
      lines.push(title);
      if (proj.technologies?.length) lines.push(`Technologies: ${proj.technologies.join(', ')}`);
      for (const bullet of proj.bullets || []) {
        lines.push(...wrapLine(`- ${bullet}`, 88));
      }
      lines.push('');
    }
  }

  if (resume.education?.length) {
    lines.push('EDUCATION');
    for (const edu of resume.education) {
      lines.push(compactText([edu.degree, edu.year], '  '));
      const instLine = compactText([edu.institution, edu.description], ' | ');
      if (instLine) lines.push(instLine);
      lines.push('');
    }
  }

  if (resume.certifications?.length) {
    lines.push('CERTIFICATIONS AND RECOGNITION');
    for (const cert of resume.certifications) {
      lines.push(...wrapLine(`- ${cert}`, 88));
    }
  }

  return lines;
}

export function buildSimplePdf(lines: string[]) {
  const pages = [];
  const printableLines = lines.length ? lines : [''];
  for (let i = 0; i < printableLines.length; i += 48) {
    pages.push(printableLines.slice(i, i + 48));
  }

  const objects: string[] = [];
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  const pageIds = pages.map((_, index) => `${3 + index * 2} 0 R`).join(' ');
  objects.push(`2 0 obj\n<< /Type /Pages /Kids [${pageIds}] /Count ${pages.length} >>\nendobj\n`);

  pages.forEach((pageLines, index) => {
    const pageObj = 3 + index * 2;
    const contentObj = pageObj + 1;
    const streamLines = ['BT', '/F1 10 Tf', '52 760 Td', '14 TL'];
    pageLines.forEach((line, lineIndex) => {
      if (lineIndex > 0) streamLines.push('T*');
      const size = line === line.toUpperCase() && line.length < 40 ? 11 : 10;
      streamLines.push(`/F1 ${size} Tf (${escapePdfText(line)}) Tj`);
    });
    streamLines.push('ET');
    const stream = streamLines.join('\n');
    objects.push(`${pageObj} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${3 + pages.length * 2} 0 R >> >> /Contents ${contentObj} 0 R >>\nendobj\n`);
    objects.push(`${contentObj} 0 obj\n<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream\nendobj\n`);
  });

  const fontObj = 3 + pages.length * 2;
  objects.push(`${fontObj} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`);

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += object;
  }
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'utf8');
}

function linesToPdfHtml(lines: string[]) {
  const rows = lines.flatMap((line) => wrapLine(line, 98));
  const body = rows.map((line, index) => {
    const trimmed = line.trim();
    const isHeading = trimmed.length > 0 && trimmed.length < 52 && trimmed === trimmed.toUpperCase();
    const isName = index === 0;
    const isHeadline = index === 1 && trimmed.length > 0;
    const isContact = index === 2 && trimmed.includes('|');
    let className: string;
    if (isName) className = 'name';
    else if (isHeadline) className = 'headline';
    else if (isContact) className = 'contact';
    else if (isHeading) className = 'heading';
    else if (trimmed.startsWith('- ')) className = 'bullet';
    else if (trimmed) className = 'line';
    else className = 'spacer';
    if (className === 'spacer') return '<div class="spacer"></div>';
    const text = className === 'bullet' ? trimmed.replace(/^-+\s*/, '') : trimmed;
    return `<div class="${className}">${className === 'bullet' ? '<span class="dot">•</span>' : ''}<span>${escapeHtml(text)}</span></div>`;
  }).join('\n');

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4; margin: 16mm 15mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #111827;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 10.5pt;
      line-height: 1.38;
    }
    .name {
      color: #0f172a;
      font-size: 20pt;
      font-weight: 700;
      line-height: 1.15;
      margin: 0 0 1.5mm;
      text-align: center;
    }
    .headline {
      color: #374151;
      font-size: 11pt;
      margin: 0 0 1mm;
      text-align: center;
    }
    .contact {
      color: #6B7280;
      font-size: 9pt;
      margin: 0 0 3mm;
      text-align: center;
    }
    .heading {
      border-bottom: 0.5pt solid #cbd5e1;
      color: #0f172a;
      font-size: 10.5pt;
      font-weight: 700;
      margin: 4mm 0 1.5mm;
      padding-bottom: 0.6mm;
    }
    .line { margin: 0 0 1.25mm; }
    .bullet {
      display: flex;
      gap: 2mm;
      margin: 0 0 1.2mm;
      padding-left: 2mm;
    }
    .dot { color: #334155; flex: 0 0 auto; }
    .spacer { height: 2mm; }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

async function tryBuildPdfWithPlaywright(lines: string[], filePath: string) {
  let browser: any = null;
  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent(linesToPdfHtml(lines), { waitUntil: 'load' });
    await page.pdf({
      path: filePath,
      format: 'A4',
      printBackground: true,
      margin: { top: '16mm', right: '15mm', bottom: '16mm', left: '15mm' },
    });
    return true;
  } catch {
    return false;
  } finally {
    if (browser) await browser.close().catch(() => undefined);
  }
}

export async function buildTextPdf(lines: string[], filePath: string): Promise<string> {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const rendered = await tryBuildPdfWithPlaywright(lines, filePath);
  if (!rendered) {
    fs.writeFileSync(filePath, buildSimplePdf(lines.flatMap((line) => wrapLine(line, 92))));
  }
  return filePath;
}

export async function buildResumePdf(resume: TailoredResume, jobId: number, options: ResumeDocumentOptions = {}): Promise<string> {
  const dir = getAppSubDir('output/resumes');
  const filename = `resume_${safeSlug(options.company, 'company')}_${safeSlug(options.title, 'role')}_job_${jobId}_v${options.version || 1}_${Date.now()}.pdf`;
  const filePath = path.join(dir, filename);
  return buildTextPdf(resumeLines(resume), filePath);
}
