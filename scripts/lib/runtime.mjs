import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

export const isWindows = os.platform() === 'win32';
export const npmCmd = isWindows ? 'npm.cmd' : 'npm';
export const npxCmd = isWindows ? 'npx.cmd' : 'npx';
export const appDirName = '.jobhunt-india';

export function loadDotEnv(envPath = path.resolve(process.cwd(), '.env.local')) {
  if (!fs.existsSync(envPath)) return;

  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();
    if (!key || process.env[key]) continue;

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

export function getBaseDir() {
  return process.env.JOBHUNT_DATA_DIR
    ? path.resolve(process.env.JOBHUNT_DATA_DIR)
    : path.join(os.homedir(), appDirName);
}

export function ensureDataDirectories(baseDir = getBaseDir()) {
  const dirs = [
    baseDir,
    path.join(baseDir, 'config'),
    path.join(baseDir, 'db'),
    path.join(baseDir, 'cache'),
    path.join(baseDir, 'logs'),
    path.join(baseDir, 'backups'),
    path.join(baseDir, 'uploads'),
    path.join(baseDir, 'embeddings'),
    path.join(baseDir, 'coach'),
    path.join(baseDir, 'exports'),
    path.join(baseDir, 'output'),
    path.join(baseDir, 'output', 'resumes'),
    path.join(baseDir, 'output', 'cover-letters'),
    path.join(baseDir, 'output', 'outreach'),
  ];

  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dirs;
}

export function ensureSettingsFile(baseDir = getBaseDir()) {
  const settingsPath = path.join(baseDir, 'config', 'settings.json');
  if (!fs.existsSync(settingsPath)) {
    fs.writeFileSync(settingsPath, JSON.stringify({
      isConfigured: false,
      onboardingStage: 'welcome',
      onboardingVersion: 2,
    }, null, 2));
  }
  return settingsPath;
}

export function run(bin, args = [], options = {}) {
  const result = spawnSync(bin, args, {
    stdio: 'inherit',
    env: { ...process.env, ...(options.env || {}) },
    cwd: options.cwd || process.cwd(),
    shell: false,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const printable = [bin, ...args].join(' ');
    throw new Error(`Command failed (${result.status ?? 'unknown'}): ${printable}`);
  }
  return result;
}

export function commandExists(command) {
  const result = isWindows
    ? spawnSync('where.exe', [command], { stdio: 'ignore' })
    : spawnSync('sh', ['-lc', `command -v ${JSON.stringify(command)} >/dev/null 2>&1`], { stdio: 'ignore' });
  return result.status === 0;
}

export function readPackageJson() {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'));
}

export function nodeMajor() {
  return Number.parseInt(process.versions.node.split('.')[0] || '0', 10);
}
