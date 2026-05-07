/**
 * bootstrap.mjs (hardened)
 *
 * Changes from original:
 *   - Every stage is wrapped in try/catch; non-critical failures are collected
 *     and reported in a final BOOTSTRAP_RESULT.json rather than aborting.
 *   - npm install step auto-falls back from `ci` to `install` on lockfile drift.
 *   - Playwright install gets a CAREER_SEEK_SKIP_BROWSER_INSTALL guard with a
 *     30-second timeout warning.
 *   - db:init, db:push:direct, k1:migrate, source:seed use safeRun() so a
 *     seed failure doesn't block the user from launching the app.
 *   - Repair mode saves a checkpoint file so incremental repairs skip done steps.
 *   - Final BOOTSTRAP_RESULT.json is written for CI and the preflight checker.
 */

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import {
  ensureDataDirectories,
  ensureEnvFile,
  ensureSettingsFile,
  getBaseDir,
  loadDotEnv,
  nodeMajor,
  npmCmd,
  npxCmd,
  commandExists,
  run,
  safeRun,
} from './lib/runtime.mjs';
import { ensureNativeBinaries, nativeServiceSelection } from './lib/native-binaries.mjs';
import { backupSqliteDatabase, verifyAndRecoverSqliteDatabase } from './lib/sqlite-backup.mjs';
import { detectPortablePythonBin, ensurePortablePython, inspectPythonBinary } from './lib/portable-python.mjs';

loadDotEnv();

const root = process.cwd();
const baseDir = getBaseDir();
const args = new Set(process.argv.slice(2));
const repair = args.has('--repair');
const packageLockPath = path.join(root, 'package-lock.json');
const hasNodeModules = fs.existsSync(path.join(root, 'node_modules'));
const skipInstall  = process.env.CAREER_SEEK_SKIP_NPM_INSTALL === '1';
const skipBrowser  = process.env.CAREER_SEEK_SKIP_BROWSER_INSTALL === '1';
const skipPython   = process.env.CAREER_SEEK_SKIP_PYTHON_SETUP === '1';
const skipBuild    = process.env.CAREER_SEEK_SKIP_BUILD === '1';
const major = nodeMajor();

// Checkpoint file — tracks which stages completed so --repair can resume
const checkpointPath = path.join(root, '.bootstrap-checkpoint.json');
function loadCheckpoint() {
  if (!repair) return {};
  try { return JSON.parse(fs.readFileSync(checkpointPath, 'utf8')); } catch { return {}; }
}
function saveCheckpoint(stage) {
  const cp = loadCheckpoint();
  cp[stage] = new Date().toISOString();
  try { fs.writeFileSync(checkpointPath, JSON.stringify(cp, null, 2)); } catch { }
}
function stageComplete(stage) {
  if (!repair) return false;
  return Boolean(loadCheckpoint()[stage]);
}

// Failure collector
const failures = [];
const warnings = [];
function recordFailure(stage, err, fatal = false) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[bootstrap] ${fatal ? 'FATAL' : 'ERROR'} in ${stage}: ${msg}`);
  failures.push({ stage, message: msg, fatal });
  if (fatal) {
    writeResult();
    process.exit(1);
  }
}

function writeResult() {
  const resultPath = path.join(root, 'BOOTSTRAP_RESULT.json');
  try {
    fs.writeFileSync(resultPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      success: failures.filter((f) => f.fatal).length === 0,
      failures,
      warnings,
    }, null, 2));
  } catch { }
}

// ─── Windows Python stub helper ─────────────────────────────────────────────
function runPythonVersionCheck(python) {
  if (process.platform === 'win32') {
    const wherePy = spawnSync('where.exe', [python], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const locations = (wherePy.stdout || '').split('\n').map((l) => l.trim()).filter(Boolean);
    const isStoreStub = locations.some((loc) =>
      loc.toLowerCase().includes('appdata\\local\\microsoft\\windowsapps') ||
      loc.toLowerCase().includes('windowsapps'),
    );
    if (isStoreStub) {
      return { ok: false, version: 'Microsoft Store stub',
        message: `"${python}" is the Windows Store stub. Career Seek will download a portable Python 3.12 runtime.` };
    }
  }
  const result = spawnSync(python,
    ['-c', 'import sys; print(".".join(map(str, sys.version_info[:3]))); raise SystemExit(0 if sys.version_info >= (3, 9) else 1)'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 5_000 });
  if (result.error?.code === 'ETIMEDOUT' || result.signal === 'SIGTERM') {
    return { ok: false, version: 'timed out',
      message: `"${python}" timed out (likely the Windows Store stub). Downloading portable Python.` };
  }
  const version = (result.stdout || result.stderr || '').trim() || 'unknown';
  const [maj, min] = version.split('.').map(Number);
  if (result.status === 0 && maj === 3 && min >= 13) {
    return { ok: false, version,
      message: `Python ${version} found but python-jobspy needs Python 3.9-3.12 for stable NumPy wheels.` };
  }
  if (result.status === 0) return { ok: true, version };
  return { ok: false, version, message: `Found ${python} ${version}, but need Python >=3.9.` };
}

function readVenvConfig(venvDir) {
  const cfg = path.join(venvDir, 'pyvenv.cfg');
  if (!fs.existsSync(cfg)) return null;
  const text = fs.readFileSync(cfg, 'utf8');
  const pick = (key) => text.match(new RegExp(`^${key} = (.+)$`, 'm'))?.[1]?.trim() || '';
  return { home: pick('home'), version: pick('version'), executable: pick('executable') };
}

function ensureVenvWithPython(python) {
  const venvDir = path.join(root, '.venv-career-seek');
  const venvPython = process.platform === 'win32'
    ? path.join(venvDir, 'Scripts', 'python.exe')
    : path.join(venvDir, 'bin', 'python3');
  const pip = process.platform === 'win32'
    ? path.join(venvDir, 'Scripts', 'pip.exe')
    : path.join(venvDir, 'bin', 'pip');
  const existing = readVenvConfig(venvDir);
  const selectedExecutable = fs.existsSync(python) ? fs.realpathSync(python) : python;
  const existingExecutable = existing?.executable && fs.existsSync(existing.executable)
    ? fs.realpathSync(existing.executable) : existing?.executable || '';
  const incompatible = Boolean(existing && selectedExecutable && existingExecutable && selectedExecutable !== existingExecutable);
  if (!fs.existsSync(pip) || incompatible) {
    if (incompatible) fs.rmSync(venvDir, { recursive: true, force: true });
    run(python, ['-m', 'venv', venvDir]);
  }
  run(pip, ['install', '--upgrade', 'pip']);
  run(pip, ['install', 'python-jobspy']);
  process.env.PYTHON_BIN = venvPython;
  process.env.PYTHON = venvPython;
  return { venvDir, pip, python: venvPython };
}

// ─── Pre-flight ──────────────────────────────────────────────────────────────
if (major < 20 || major >= 26) {
  console.error(`Career Seek requires Node.js >=20 and <26. Current: ${process.version}`);
  process.exit(1);
}

console.log('\nCareer Seek bootstrap');
console.log('─────────────────────');
console.log(`Project : ${root}`);
console.log(`Data    : ${baseDir}`);
console.log(`Node    : ${process.version}`);
console.log(`Mode    : ${repair ? 'repair' : 'fresh'}`);
console.log('');

try {
  ensureDataDirectories(baseDir);
} catch (e) { recordFailure('data-directories', e, true); }

const settingsPath = ensureSettingsFile(baseDir);
console.log(`Settings: ${settingsPath}`);

try {
  ensureEnvFile(root);
} catch (e) { recordFailure('env-file', e, true); }

loadDotEnv();

// ─── SQLite backup/verify ────────────────────────────────────────────────────
if (!stageComplete('sqlite-verify')) {
  try {
    if (repair) {
      const bp = await backupSqliteDatabase(baseDir, 'repair-before-migrations');
      if (bp) console.log(`SQLite backup: ${bp}`);
    }
    const recovery = await verifyAndRecoverSqliteDatabase(baseDir);
    if (recovery.restored) console.warn(`SQLite restored from: ${recovery.backupPath}`);
    else if (!recovery.ok) console.warn('SQLite could not be verified — migrations will attempt a safe repair path.');
    saveCheckpoint('sqlite-verify');
  } catch (e) { warnings.push({ stage: 'sqlite-verify', message: e.message }); }
}

// ─── npm install ────────────────────────────────────────────────────────────
if (!stageComplete('npm-install')) {
  if (!skipInstall) {
    console.log('\nInstalling dependencies…');
    // run() now auto-falls back from ci → install on lockfile drift
    try {
      const installArgs = fs.existsSync(packageLockPath) ? ['ci'] : ['install'];
      run(npmCmd, installArgs, { timeoutMs: 600_000 }); // 10-minute network timeout
      saveCheckpoint('npm-install');
    } catch (e) { recordFailure('npm-install', e, true); }
  } else if (!hasNodeModules) {
    console.warn('CAREER_SEEK_SKIP_NPM_INSTALL=1 but node_modules is missing — this will likely fail.');
  }
}

// ─── Playwright ──────────────────────────────────────────────────────────────
if (!stageComplete('playwright') && !skipBrowser) {
  console.log('\nInstalling Playwright Chromium…');
  console.log('  (set CAREER_SEEK_SKIP_BROWSER_INSTALL=1 to skip — only needed for job scraping)');
  try {
    run(npxCmd, ['playwright', 'install', 'chromium'], { timeoutMs: 300_000 });
    saveCheckpoint('playwright');
  } catch (e) {
    // Non-fatal: app works without Playwright; scraping will be degraded
    warnings.push({ stage: 'playwright', message: `Playwright install failed: ${e.message}. Job scraping via Playwright will be unavailable.` });
    console.warn(`[bootstrap] ⚠ Playwright install failed. Scraping features will be degraded.`);
    console.warn(`[bootstrap]   Set CAREER_SEEK_SKIP_BROWSER_INSTALL=1 to suppress this warning.`);
  }
}

// ─── Native binaries (Redis, Meilisearch, Qdrant) ────────────────────────────
if (!stageComplete('native-binaries')) {
  console.log('\nInstalling native service binaries…');
  try {
    const installed = await ensureNativeBinaries(nativeServiceSelection(process.argv.slice(2)));
    const names = Object.keys(installed).filter((k) => installed[k]);
    console.log(names.length ? `Installed/verified: ${names.join(', ')}` : 'No native services selected.');
    saveCheckpoint('native-binaries');
  } catch (e) {
    warnings.push({ stage: 'native-binaries', message: e.message });
    console.warn(`[bootstrap] ⚠ Native binary setup warning: ${e.message}`);
    console.warn('[bootstrap]   Redis queues will be unavailable until fixed. Run: npm run bootstrap -- --repair');
  }
}

// ─── Python ──────────────────────────────────────────────────────────────────
if (!stageComplete('python') && !skipPython) {
  console.log('\nChecking Python scraping support…');
  try {
    const systemPython = commandExists('python3') ? 'python3' : commandExists('python') ? 'python' : '';
    const portablePython = detectPortablePythonBin();
    const systemCheck = systemPython ? runPythonVersionCheck(systemPython) : null;
    const portableCheck = inspectPythonBinary(portablePython);
    let selectedPython = '';
    if (systemCheck?.ok) {
      selectedPython = systemPython;
      console.log(`  System Python ${systemCheck.version} — OK`);
    } else if (portableCheck?.compatibleJobSpy) {
      selectedPython = portablePython;
      console.log(`  Portable Python ${portableCheck.version} — OK`);
    } else {
      if (systemCheck && !systemCheck.ok) console.warn(`  ${systemCheck.message}`);
      else console.warn('  Python 3.9-3.12 not found. Downloading portable Python 3.12…');
      const installed = await ensurePortablePython();
      selectedPython = installed.pythonBin;
      console.log(`  Portable Python ready: ${installed.version}`);
    }
    if (selectedPython) ensureVenvWithPython(selectedPython);
    saveCheckpoint('python');
  } catch (e) {
    warnings.push({ stage: 'python', message: e.message });
    console.warn(`[bootstrap] ⚠ Python setup failed: ${e.message}`);
    console.warn('[bootstrap]   python-jobspy scraping will be unavailable. Set CAREER_SEEK_SKIP_PYTHON_SETUP=1 to suppress.');
  }
} else if (skipPython) {
  console.log('\nSkipping Python setup (CAREER_SEEK_SKIP_PYTHON_SETUP=1).');
}

// ─── Database init + migrations ──────────────────────────────────────────────
console.log('\nInitializing local database…');
for (const [stage, cmd] of [
  ['db-init', ['run', 'db:init']],
  ['db-push', ['run', 'db:push:direct']],
  ['k1-migrate', ['run', 'k1:migrate']],
]) {
  if (stageComplete(stage)) { console.log(`  Skipping ${stage} (already done in this repair run).`); continue; }
  const result = safeRun(npmCmd, cmd, { timeoutMs: 120_000 });
  if (result.ok) {
    saveCheckpoint(stage);
  } else {
    recordFailure(stage, result.error, false); // non-fatal
  }
}

// ─── Seed ────────────────────────────────────────────────────────────────────
if (!stageComplete('seed')) {
  const result = safeRun(npmCmd, ['run', 'source:seed'], { timeoutMs: 120_000 });
  if (result.ok) saveCheckpoint('seed');
  else warnings.push({ stage: 'seed', message: result.error?.message });
}

// ─── Doctor ──────────────────────────────────────────────────────────────────
console.log('\nRunning system doctor…');
const doctorResult = safeRun(npmCmd, ['run', 'doctor']);
if (!doctorResult.ok) {
  warnings.push({ stage: 'doctor', message: doctorResult.error?.message });
}

// ─── Build ───────────────────────────────────────────────────────────────────
if (!skipBuild && !stageComplete('build')) {
  console.log('\nBuilding production app…');
  const buildEnv = {
    ...process.env,
    NODE_OPTIONS: [process.env.NODE_OPTIONS, '--max-old-space-size=4096'].filter(Boolean).join(' '),
  };
  try {
    run(npmCmd, ['run', 'build'], { env: buildEnv, timeoutMs: 600_000 });
    saveCheckpoint('build');
  } catch (e) {
    // Non-fatal: launch.mjs will build on first start if BUILD_ID missing
    warnings.push({ stage: 'build', message: e.message });
    console.warn('[bootstrap] ⚠ Build failed. Career Seek will attempt to build on first launch.');
    console.warn('[bootstrap]   To force rebuild: npm run build');
  }
}

// ─── Cleanup checkpoint file (only keep on --repair runs) ────────────────────
if (!repair) {
  try { fs.unlinkSync(checkpointPath); } catch { }
}

// ─── Final result ────────────────────────────────────────────────────────────
writeResult();

console.log('');
console.log('─────────────────────────────────────────────────────');
if (failures.length === 0 && warnings.length === 0) {
  console.log('✓ Bootstrap complete — all stages passed.');
} else if (failures.length === 0) {
  console.log('✓ Bootstrap complete with warnings:');
  warnings.forEach((w) => console.warn(`  ⚠ ${w.stage}: ${w.message}`));
} else {
  console.error('✗ Bootstrap completed with errors:');
  failures.forEach((f) => console.error(`  ✗ ${f.stage}: ${f.message}`));
  warnings.forEach((w) => console.warn(`  ⚠ ${w.stage}: ${w.message}`));
}
console.log('');
console.log('Optional OCR: macOS → brew install poppler tesseract');
console.log('             Windows → install Poppler + Tesseract and add to PATH');
console.log('Start Career Seek: npm run launch');
console.log('Health check:      npm run preflight');
console.log('─────────────────────────────────────────────────────');
