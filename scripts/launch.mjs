import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import {
  ensureDataDirectories,
  ensureSettingsFile,
  getBaseDir,
  loadDotEnv,
  npmCmd,
  run,
} from './lib/runtime.mjs';
import { startNativeServices, nativeServiceSelection } from './lib/native-binaries.mjs';
import { backupSqliteDatabase, verifyAndRecoverSqliteDatabase } from './lib/sqlite-backup.mjs';
import { detectPortablePythonBin } from './lib/portable-python.mjs';

loadDotEnv();

const args = new Set(process.argv.slice(2));
const devMode = args.has('--dev') || process.env.CAREER_SEEK_DEV === '1';
const skipBuild = args.has('--skip-build') || process.env.CAREER_SEEK_SKIP_BUILD === '1';
const repair = args.has('--repair');
const skipNativeServices = args.has('--skip-services') || process.env.CAREER_SEEK_SKIP_NATIVE_SERVICES === '1';
const port = process.env.PORT || process.env.CAREER_SEEK_PORT || '3000';
const host = process.env.CAREER_SEEK_HOST || '127.0.0.1';
const displayHost = host === '0.0.0.0' || host === '::' ? 'localhost' : host;
const baseDir = getBaseDir();
const children = new Set();
const appChildren = new Set();
const nativeChildren = new Set();
let runtimeEnv = { ...process.env, JOBHUNT_DATA_DIR: baseDir, PORT: port };
const venvPython = process.platform === 'win32'
  ? path.join(process.cwd(), '.venv-career-seek', 'Scripts', 'python.exe')
  : path.join(process.cwd(), '.venv-career-seek', 'bin', 'python3');
const portablePython = detectPortablePythonBin();
if (!runtimeEnv.PYTHON_BIN && fs.existsSync(venvPython)) {
  runtimeEnv = { ...runtimeEnv, PYTHON_BIN: venvPython, PYTHON: venvPython };
} else if (!runtimeEnv.PYTHON_BIN && portablePython) {
  runtimeEnv = { ...runtimeEnv, PYTHON_BIN: portablePython, PYTHON: portablePython };
}

const envSchema = z.object({
  JOBHUNT_DATA_DIR: z.string().min(1),
  PORT: z.string().regex(/^\d+$/, 'PORT must be numeric'),
  REDIS_URL: z.string().url().optional(),
  MEILI_HOST: z.string().url().optional(),
  MEILISEARCH_URL: z.string().url().optional(),
  QDRANT_URL: z.string().url().optional(),
});

function validateRuntimeEnv(env) {
  const result = envSchema.safeParse(env);
  if (result.success) return true;
  console.error('[launch] Career Seek cannot start because runtime configuration is invalid:');
  for (const issue of result.error.issues) {
    console.error(` - ${issue.path.join('.')}: ${issue.message}`);
  }
  console.error('[launch] Fix .env.local or rerun setup.sh --repair.');
  return false;
}

function trackChild(child, group) {
  children.add(child);
  group?.add(child);
  child.on('exit', () => {
    children.delete(child);
    group?.delete(child);
  });
}

function spawnManaged(label, bin, commandArgs, options = {}) {
  console.log(`[launch] Starting ${label}: ${bin} ${commandArgs.join(' ')}`);
  const child = spawn(bin, commandArgs, {
    stdio: 'inherit',
    env: { ...runtimeEnv, ...(options.env || {}) },
    shell: false,
  });
  trackChild(child, appChildren);

  child.on('error', (error) => {
    console.error(`[launch] ${label} failed to start: ${error.message}`);
  });
  return child;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForChildrenToExit(group, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const running = [...group].filter((child) => child.exitCode === null && child.signalCode === null);
    if (!running.length) return;
    await sleep(150);
  }
}

let shuttingDown = false;
function stopGroup(group, signal) {
  for (const child of [...group]) {
    if (child.exitCode === null && child.signalCode === null) child.kill(signal);
  }
}

function shutdown(signal = 'SIGTERM') {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('\n[launch] Shutting down Career Seek...');
  clearInterval(backupInterval);
  stopGroup(appChildren, signal);
  waitForChildrenToExit(appChildren, 4_000)
    .then(() => {
      stopGroup(nativeChildren, signal);
      return waitForChildrenToExit(nativeChildren, 2_000);
    })
    .then(() => backupSqliteDatabase(baseDir, 'shutdown'))
    .catch((error) => console.warn(`[launch] SQLite shutdown backup skipped: ${error.message}`))
    .finally(() => process.exit(0));
}

async function waitForAppAndOpen() {
  const url = `http://${displayHost}:${port}`;
  const started = Date.now();
  while (Date.now() - started < 30_000) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (response.status < 500) break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 600));
      continue;
    }
  }

  if (process.env.CAREER_SEEK_OPEN_BROWSER === '0') return;
  const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd.exe' : 'xdg-open';
  const openerArgs = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  spawn(opener, openerArgs, { stdio: 'ignore', detached: true }).unref();
  console.log(`[launch] Opened ${url}`);
}

console.log('Career Seek launcher');
console.log('--------------------');
console.log(`Mode: ${devMode ? 'development' : 'production'}`);
console.log(`Data: ${baseDir}`);
console.log(`URL:  http://${displayHost}:${port}`);
if (repair) console.log('Repair: enabled');

ensureDataDirectories(baseDir);
ensureSettingsFile(baseDir);

const recovery = await verifyAndRecoverSqliteDatabase(baseDir);
if (recovery.restored) {
  console.warn(`[launch] SQLite was restored from latest backup: ${recovery.backupPath}`);
}
if (repair) {
  const backupPath = await backupSqliteDatabase(baseDir, 'repair-before-launch');
  if (backupPath) console.log(`[launch] SQLite backup before repair: ${backupPath}`);
}

if (!skipNativeServices) {
  console.log('\n[launch] Starting native support services...');
  try {
    const native = await startNativeServices({
      selection: nativeServiceSelection(process.argv.slice(2)),
      env: runtimeEnv,
      onChild: (child) => trackChild(child, nativeChildren),
    });
    runtimeEnv = { ...runtimeEnv, ...native.env };
  } catch (error) {
    console.warn(`[launch] Native services are degraded: ${error instanceof Error ? error.message : String(error)}`);
    console.warn('[launch] The app will still open. The System Status panel will show what needs attention.');
  }
} else {
  console.log('\n[launch] Skipping native support services because CAREER_SEEK_SKIP_NATIVE_SERVICES=1 or --skip-services was used.');
}

if (!validateRuntimeEnv(runtimeEnv)) {
  process.exit(1);
}

console.log('\n[launch] Ensuring local database is ready...');
run(npmCmd, ['run', 'db:init'], { env: runtimeEnv });
run(npmCmd, ['run', 'db:push:direct'], { env: runtimeEnv });
run(npmCmd, ['run', 'k1:migrate'], { env: runtimeEnv });
run(npmCmd, ['run', 'source:seed'], { env: runtimeEnv });

console.log('\n[launch] Running doctor...');
run(npmCmd, ['run', 'doctor'], { env: runtimeEnv });

if (!devMode && !skipBuild) {
  const buildIdPath = path.resolve(process.cwd(), '.next', 'BUILD_ID');
  if (!fs.existsSync(buildIdPath)) {
    console.log('\n[launch] Production build not found; building now...');
    run(npmCmd, ['run', 'build'], { env: runtimeEnv });
  }
}

const serverArgs = devMode
  ? ['run', 'dev', '--', '-H', host, '-p', port]
  : ['run', 'start', '--', '-H', host, '-p', port];

const appServer = spawnManaged(devMode ? 'Next.js dev server' : 'Next.js production server', npmCmd, serverArgs);
void waitForAppAndOpen();
// Default to local Redis when no explicit REDIS_URL is set — ensure-redis.mjs has
// already started or confirmed Redis at this point, so we can always launch the worker.
const effectiveRedisUrl = runtimeEnv.REDIS_URL || 'redis://127.0.0.1:6379';
runtimeEnv = { ...runtimeEnv, REDIS_URL: effectiveRedisUrl };
let jobWorker = null;
jobWorker = spawnManaged('background job worker', npmCmd, ['run', 'worker']);
if (process.env.CAREER_SEEK_ENABLE_BULL_BOARD === '1') {
  spawnManaged('Bull Board', npmCmd, ['run', 'bull-board']);
}

const backupInterval = setInterval(() => {
  backupSqliteDatabase(baseDir, 'periodic').catch((error) => {
    console.warn(`[launch] Periodic SQLite backup skipped: ${error.message}`);
  });
}, 30 * 60 * 1000);
backupInterval.unref?.();

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

appServer.on('exit', (code) => {
  if (shuttingDown) return;
  if (code && code !== 0) {
    console.error(`[launch] App server exited with code ${code}.`);
    jobWorker?.kill('SIGTERM');
    process.exit(code);
  }
});

jobWorker?.on('exit', (code) => {
  if (shuttingDown) return;
  if (code && code !== 0) {
    console.error(`[launch] Worker exited with code ${code}. The web app can keep running, but background scans may be unavailable.`);
  }
});
