import { Document, Paragraph, TextRun, Packer, HeadingLevel, AlignmentType } from 'docx';
import { TailoredResume } from './resume-tailor';
import * as fs from 'fs';
import * as path from 'path';
import { getAppSubDir } from '../../local-paths';

export async function buildResumeDocx(resume: TailoredResume, jobId: number): Promise<string> {
  const children: any[] = [];

  // Header
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: resume.fullName, bold: true, size: 36 }),
      ],
      spacing: { after: 120 }
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: resume.headline, size: 24, color: "666666" }),
      ],
      spacing: { after: 240 }
    })
  );

  // Summary
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: "Professional Summary", bold: true, size: 28 })],
      spacing: { before: 240, after: 120 }
    }),
    new Paragraph({
      children: [new TextRun({ text: resume.summary, size: 22 })],
      spacing: { after: 240 }
    })
  );

  // Skills
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: "Core Competencies", bold: true, size: 28 })],
      spacing: { before: 240, after: 120 }
    }),
    new Paragraph({
      children: [new TextRun({ text: resume.skills.join(" • "), size: 22 })],
      spacing: { after: 240 }
    })
  );

  // Experience
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: "Professional Experience", bold: true, size: 28 })],
      spacing: { before: 240, after: 120 }
    })
  );

  for (const exp of resume.experience) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: exp.role, bold: true, size: 24 }),
          new TextRun({ text: ` | ${exp.company}`, size: 24 }),
        ],
        spacing: { before: 120, after: 60 }
      }),
      new Paragraph({
        children: [
          new TextRun({ text: exp.duration, italics: true, size: 20 }),
        ],
        spacing: { after: 60 }
      })
    );

    for (const bullet of exp.bullets) {
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          children: [new TextRun({ text: bullet, size: 22 })],
          spacing: { after: 60 }
        })
      );
    }
  }

  // Education
  if (resume.education && resume.education.length > 0) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: "Education", bold: true, size: 28 })],
        spacing: { before: 240, after: 120 }
      })
    );
    for (const edu of resume.education) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: edu.degree, bold: true, size: 22 }),
            new TextRun({ text: ` | ${edu.institution} (${edu.year})`, size: 22 }),
          ],
          spacing: { after: 60 }
        })
      );
    }
  }

  const doc = new Document({
    sections: [{
      properties: {},
      children: children
    }]
  });

  const buffer = await Packer.toBuffer(doc);
  
  // Save locally
  const dir = getAppSubDir('output/resumes');

  const filename = `resume_job_${jobId}_${Date.now()}.docx`;
  const filePath = path.join(dir, filename);
  
  fs.writeFileSync(filePath, buffer);
  
  return filePath;
}
