#!/usr/bin/env tsx
/**
 * CLI resume uploader — same pipeline as the onboarding UI action.
 * Usage: npx tsx scripts/upload-resume.ts /path/to/resume.docx
 */
import fs from 'fs';
import path from 'path';
import { getDb } from '../src/db';
import { uploadedResumes } from '../src/db/schema';
import { getAppSubDir } from '../src/lib/local-paths';
import { runLocalResumePipeline, buildResumePipelineMetadata } from '../src/lib/services/resume';
import { saveAppConfig } from '../src/lib/config';

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: npx tsx scripts/upload-resume.ts /path/to/resume.pdf|docx');
  process.exit(1);
}

const absPath = path.resolve(filePath);
if (!fs.existsSync(absPath)) {
  console.error(`File not found: ${absPath}`);
  process.exit(1);
}

const ext = path.extname(absPath).toLowerCase();
if (ext !== '.pdf' && ext !== '.docx') {
  console.error('Only .pdf and .docx files are supported');
  process.exit(1);
}

const mimeType = ext === '.pdf'
  ? 'application/pdf'
  : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const filename = path.basename(absPath);

async function main() {
  console.log(`Uploading: ${filename}`);

  const uploadsDir = getAppSubDir('uploads');
  const safeName = `${Date.now()}-${filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
  const destPath = path.join(uploadsDir, safeName);

  fs.copyFileSync(absPath, destPath);
  console.log(`Copied to: ${destPath}`);

  console.log('Running resume pipeline (parse + profile build)...');
  let pipelineRun;
  try {
    pipelineRun = await runLocalResumePipeline({
      resumeId: safeName,
      filename,
      filePath: destPath,
      mimeType,
    });
  } catch (err) {
    fs.rmSync(destPath, { force: true });
    throw err;
  }

  const pipelineMetadata = buildResumePipelineMetadata(pipelineRun);
  const parserMetadata = (pipelineRun.parsed.metadata.original || pipelineRun.parsed.metadata) as any;
  const metadata = {
    parser: parserMetadata,
    pipeline: pipelineMetadata,
    clarification: pipelineMetadata.clarification,
    profileBuilder: pipelineMetadata.profileBuilder,
    analysis: null,
    clarificationAnswers: {},
  };

  const db = getDb();
  // Bootstrap profile id = 1
  const result = db.insert(uploadedResumes).values({
    profileId: 1,
    filename,
    originalPath: destPath,
    mimeType,
    parsedText: pipelineRun.parsed.text,
    parseMetadata: JSON.stringify(metadata),
    uploadedAt: new Date(),
  }).returning({ id: uploadedResumes.id }).get();

  saveAppConfig({ resumeUploadId: result.id, onboardingStage: 'analysis', onboardingStep: 2 });

  console.log(`\nResume saved — DB id: ${result.id}`);
  console.log(`Parsed text length: ${pipelineRun.parsed.text?.length ?? 0} chars`);
  if (parserMetadata?.warnings?.length) {
    console.log(`Parse warnings: ${parserMetadata.warnings.join(', ')}`);
  }
  console.log('\nDone. Refresh the browser to see the new source resume in Resume Kit.');
}

main().catch((err) => {
  console.error('Upload failed:', err);
  process.exit(1);
});
