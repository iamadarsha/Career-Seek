import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const root = process.cwd();
const command = os.platform() === 'win32' ? 'npm.cmd' : 'npm';
const cleanDir = path.resolve(root, 'data-clean-proof');
const port = process.env.CLEAN_RUN_PORT || '3030';

if (!cleanDir.startsWith(root) || path.basename(cleanDir) !== 'data-clean-proof') {
  throw new Error(`Refusing to clean unexpected directory: ${cleanDir}`);
}

function run(args) {
  console.log(`\n$ JOBHUNT_DATA_DIR=${cleanDir} npm ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: { ...process.env, JOBHUNT_DATA_DIR: cleanDir },
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

console.log('[clean-run] Removing previous isolated proof data directory...');
fs.rmSync(cleanDir, { recursive: true, force: true });

for (const dir of [
  cleanDir,
  path.join(cleanDir, 'config'),
  path.join(cleanDir, 'db'),
  path.join(cleanDir, 'uploads'),
  path.join(cleanDir, 'output', 'resumes'),
  path.join(cleanDir, 'output', 'cover-letters'),
  path.join(cleanDir, 'output', 'outreach'),
  path.join(cleanDir, 'logs'),
]) {
  fs.mkdirSync(dir, { recursive: true });
}

fs.writeFileSync(path.join(cleanDir, 'config', 'settings.json'), JSON.stringify({
  isConfigured: false,
  onboardingStage: 'welcome',
  onboardingVersion: 2,
}, null, 2));

run(['run', 'db:init']);
run(['run', 'db:push:direct']);
run(['run', 'k1:migrate']);
run(['run', 'source:seed']);
run(['run', 'doctor']);

console.log(`\n[clean-run] Starting isolated dev server on http://localhost:${port}`);
console.log(`[clean-run] JOBHUNT_DATA_DIR=${cleanDir}`);

const devServer = spawn(command, ['run', 'dev', '--', '-p', port], {
  stdio: 'inherit',
  env: { ...process.env, JOBHUNT_DATA_DIR: cleanDir },
});

devServer.on('error', (error) => {
  console.error('[clean-run] Failed to start dev server:', error);
});

process.on('SIGINT', () => {
  console.log('\n[clean-run] Shutting down isolated dev server...');
  devServer.kill();
  process.exit(0);
});
