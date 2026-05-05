import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

const root = process.cwd();
const candidates = (process.env.CAREER_SEEK_QA_CANDIDATES || 'ai-pm-senior,backend-mid,ux-junior,finance-compliance')
  .split(',')
  .map((candidate) => candidate.trim())
  .filter(Boolean);
const sourceDataDir = process.env.CAREER_SEEK_SOURCE_DATA_DIR || path.join(root, 'data');
const qaRoot = path.resolve(process.env.CAREER_SEEK_QA_ROOT || path.join(root, 'data', 'qa-mammoth'));
const maxJobs = process.env.CAREER_SEEK_QA_MAX_JOBS || '5';
const portals = process.env.CAREER_SEEK_QA_PORTALS || '';
const keepExisting = process.env.CAREER_SEEK_QA_KEEP === '1';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      ...options.env,
    },
  });
  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${command} ${args.join(' ')}`);
  }
}

function safeCleanDir(dir) {
  const resolved = path.resolve(dir);
  const allowed = path.resolve(qaRoot);
  if (!resolved.startsWith(allowed) || resolved === allowed || resolved === root || resolved === os.homedir()) {
    throw new Error(`Refusing to clean unexpected directory: ${resolved}`);
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}

function prepareDataDir(dataDir) {
  if (!keepExisting) safeCleanDir(dataDir);
  fs.mkdirSync(dataDir, { recursive: true });
  const env = {
    JOBHUNT_DATA_DIR: dataDir,
    CAREER_SEEK_SOURCE_DATA_DIR: sourceDataDir,
  };
  run('node', ['scripts/db-init.mjs'], { env });
  run('node', ['scripts/db-schema-push.mjs'], { env });
  run('node', ['scripts/k1-bootstrap-migration.mjs'], { env });
  run('node', ['scripts/seed-source-universe.mjs'], { env });
}

function main() {
  fs.mkdirSync(qaRoot, { recursive: true });
  const results = [];

  for (const candidate of candidates) {
    const dataDir = path.join(qaRoot, candidate);
    const reportPath = path.join(dataDir, 'proof', `${candidate}-proof-report.json`);
    console.log(`\n=== QA proof: ${candidate} ===`);
    if (keepExisting && fs.existsSync(reportPath)) {
      console.log(`Reusing existing proof report for ${candidate}`);
      results.push(JSON.parse(fs.readFileSync(reportPath, 'utf8')));
      continue;
    }
    prepareDataDir(dataDir);
    const env = {
      JOBHUNT_DATA_DIR: dataDir,
      CAREER_SEEK_SOURCE_DATA_DIR: sourceDataDir,
      CAREER_SEEK_QA_MAX_JOBS: maxJobs,
      ...(portals ? { CAREER_SEEK_QA_PORTALS: portals } : {}),
    };
    run('npx', ['tsx', 'scripts/qa/proof-candidate.ts', '--candidate', candidate, '--max-jobs', maxJobs], { env });
    results.push(JSON.parse(fs.readFileSync(reportPath, 'utf8')));
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    qaRoot,
    candidates: results.map((result) => ({
      slug: result.candidate.slug,
      targetTitle: result.candidate.targetTitle,
      activeProvider: result.aiProviderProof?.activeProvider || 'unknown',
      noKeyPathAvailable: Boolean(result.aiProviderProof?.noKeyPathAvailable),
      ollamaConfigured: Boolean(result.aiProviderProof?.ollamaConfigured),
      cloudConfigured: Boolean(result.aiProviderProof?.cloudConfigured),
      extractionMode: result.extractionMode,
      scanStatus: result.scan.status,
      totalJobsFound: result.scan.totalJobsFound,
      failedPortals: result.scan.failedPortals,
      scoredCount: result.scoredCount,
      jobProofs: result.jobProofs.length,
      averageScore: result.jobProofs.length
        ? Math.round(result.jobProofs.reduce((sum, job) => sum + Number(job.score || 0), 0) / result.jobProofs.length)
        : 0,
      atsScores: result.jobProofs.map((job) => job.atsScore),
      issueCount: result.issues.length,
      criticalIssues: result.issues.filter((issue) => issue.severity === 'critical').length,
      reportPath: path.join(qaRoot, result.candidate.slug, 'proof', `${result.candidate.slug}-proof-report.json`),
    })),
  };

  const summaryPath = path.join(qaRoot, 'four-candidate-summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(`\nSummary written to ${summaryPath}`);
  console.log(JSON.stringify(summary, null, 2));
}

main();
