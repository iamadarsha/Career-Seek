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
const skipInstall = process.env.CAREER_SEEK_SKIP_NPM_INSTALL === '1';
const skipBrowserInstall = process.env.CAREER_SEEK_SKIP_BROWSER_INSTALL === '1';
const skipPythonSetup = process.env.CAREER_SEEK_SKIP_PYTHON_SETUP === '1';
const skipBuild = process.env.CAREER_SEEK_SKIP_BUILD === '1';
const major = nodeMajor();

function runPythonVersionCheck(python) {
  // On Windows, python3 / python may be the Microsoft Store stub.
  // The stub exits immediately with code 9009 (or opens the Store and hangs).
  // Detect it by running with a short timeout and checking the path.
  if (process.platform === 'win32') {
    const wherePy = spawnSync('where.exe', [python], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const locations = (wherePy.stdout || '').split('\n').map((l) => l.trim()).filter(Boolean);
    const isStoreStub = locations.some((loc) =>
      loc.toLowerCase().includes('appdata\\local\\microsoft\\windowsapps') ||
      loc.toLowerCase().includes('windowsapps'),
    );
    if (isStoreStub) {
      return {
        ok: false,
        version: 'Microsoft Store stub',
        message: `The "${python}" command resolves to the Windows Store stub (${locations[0]}). Career Seek will download a portable Python 3.12 runtime instead.`,
      };
    }
  }

  const result = spawnSync(python, ['-c', 'import sys; print(".".join(map(str, sys.version_info[:3]))); raise SystemExit(0 if sys.version_info >= (3, 9) else 1)'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 5_000, // bail if stub hangs on Windows
  });

  // Timed out — almost certainly the Windows Store stub hung waiting for user interaction
  if (result.error?.code === 'ETIMEDOUT' || result.signal === 'SIGTERM') {
    return {
      ok: false,
      version: 'timed out',
      message: `"${python}" timed out (likely the Windows Store stub). Career Seek will download a portable Python 3.12 runtime instead.`,
    };
  }

  const version = (result.stdout || result.stderr || '').trim() || 'unknown version';
  const [major, minor] = version.split('.').map((part) => Number(part));
  if (result.status === 0 && major === 3 && minor >= 13) {
    return {
      ok: false,
      version,
      message: `Found ${python} ${version}. python-jobspy currently installs most reliably on Python 3.9-3.12 because one dependency pins older NumPy wheels.`,
    };
  }
  if (result.status === 0) return { ok: true, version };
  return {
    ok: false,
    version,
    message: `Found ${python} ${version}, but Career Seek needs Python 3.9+ for python-jobspy.`,
  };
}

function readVenvConfig(venvDir) {
  const pyvenvCfg = path.join(venvDir, 'pyvenv.cfg');
  if (!fs.existsSync(pyvenvCfg)) return null;
  const cfgText = fs.readFileSync(pyvenvCfg, 'utf8');
  const pick = (key) => cfgText.match(new RegExp(`^${key} = (.+)$`, 'm'))?.[1]?.trim() || '';
  return {
    home: pick('home'),
    version: pick('version'),
    executable: pick('executable'),
  };
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
  const selected = inspectPythonBinary(python);
  const selectedExecutable = fs.existsSync(python) ? fs.realpathSync(python) : python;
  const existingExecutable = existing?.executable && fs.existsSync(existing.executable)
    ? fs.realpathSync(existing.executable)
    : existing?.executable || '';
  const incompatibleVenv = Boolean(
    existing && (
      (selectedExecutable && existingExecutable && selectedExecutable !== existingExecutable) ||
      (selected?.version && existing.version && selected.version !== existing.version)
    ),
  );
  if (!fs.existsSync(pip) || incompatibleVenv) {
    if (incompatibleVenv) {
      fs.rmSync(venvDir, { recursive: true, force: true });
    }
    run(python, ['-m', 'venv', venvDir]);
  }
  run(pip, ['install', '--upgrade', 'pip']);
  run(pip, ['install', 'python-jobspy']);
  process.env.PYTHON_BIN = venvPython;
  process.env.PYTHON = venvPython;
  return { venvDir, pip, python: venvPython };
}

if (major < 20 || major >= 26) {
  console.error(`Career Seek requires Node.js >=20 and <26. Current version: ${process.version}`);
  process.exit(1);
}

console.log('Career Seek bootstrap');
console.log('---------------------');
console.log(`Project: ${root}`);
console.log(`Data:    ${baseDir}`);
console.log(`Node:    ${process.version}`);
if (repair) console.log('Mode:    repair');

ensureDataDirectories(baseDir);
const settingsPath = ensureSettingsFile(baseDir);
console.log(`Settings: ${settingsPath}`);

// Ensure .env.local exists with REDIS_URL so the BullMQ worker always starts.
ensureEnvFile(root);
// Reload so subsequent run() calls inherit the new env values.
loadDotEnv();

if (repair) {
  const backupPath = await backupSqliteDatabase(baseDir, 'repair-before-migrations');
  if (backupPath) console.log(`SQLite backup before repair: ${backupPath}`);
}

if (!skipInstall) {
  const installArgs = fs.existsSync(packageLockPath) ? ['ci'] : ['install'];
  console.log(`\nInstalling dependencies with npm ${installArgs.join(' ')}...`);
  run(npmCmd, installArgs);
} else if (!hasNodeModules) {
  console.warn('CAREER_SEEK_SKIP_NPM_INSTALL=1 was set, but node_modules is missing.');
}

const recovery = await verifyAndRecoverSqliteDatabase(baseDir);
if (recovery.restored) {
  console.warn(`SQLite looked unhealthy; restored latest backup: ${recovery.backupPath}`);
} else if (!recovery.ok) {
  console.warn('SQLite could not be verified and no backup was available. Migrations will attempt a safe repair/create path.');
}

if (!skipBrowserInstall) {
  console.log('\nInstalling Playwright Chromium...');
  run(npxCmd, ['playwright', 'install', 'chromium']);
}

console.log('\nInstalling native support service binaries...');
try {
  const installed = await ensureNativeBinaries(nativeServiceSelection(process.argv.slice(2)));
  const names = Object.keys(installed);
  console.log(names.length ? `Installed/verified: ${names.join(', ')}` : 'No native support services selected.');
} catch (error) {
  console.warn(`Native binary setup warning: ${error instanceof Error ? error.message : String(error)}`);
  console.warn('Career Seek will continue where possible. Redis-backed queues need Redis; Meilisearch/Qdrant have local fallbacks.');
}

if (!skipPythonSetup) {
  console.log('\nChecking Python scraping support...');
  const systemPython = commandExists('python3') ? 'python3' : commandExists('python') ? 'python' : '';
  const portablePython = detectPortablePythonBin();
  const systemCheck = systemPython ? runPythonVersionCheck(systemPython) : null;
  const portableCheck = inspectPythonBinary(portablePython);

  let selectedPython = '';
  if (systemCheck?.ok) {
    selectedPython = systemPython;
    console.log(`OK Python ${systemCheck.version}`);
  } else if (portableCheck?.compatibleJobSpy) {
    selectedPython = portablePython;
    console.log(`Using bundled Python ${portableCheck.version}`);
  } else {
    if (systemCheck && !systemCheck.ok) {
      console.warn(systemCheck.message);
    } else {
      console.warn('Python 3.9-3.12 was not found. Downloading a portable Python 3.12 runtime for python-jobspy.');
    }
    const installed = await ensurePortablePython();
    selectedPython = installed.pythonBin;
    console.log(`Portable Python ready: ${installed.version}`);
  }

  if (selectedPython) {
    ensureVenvWithPython(selectedPython);
  }
} else {
  console.log('\nSkipping Python scraping setup because CAREER_SEEK_SKIP_PYTHON_SETUP=1.');
}

console.log('\nInitializing local database and seed data...');
run(npmCmd, ['run', 'db:init']);
run(npmCmd, ['run', 'db:push:direct']);
run(npmCmd, ['run', 'k1:migrate']);
run(npmCmd, ['run', 'source:seed']);

console.log('\nRunning system doctor...');
run(npmCmd, ['run', 'doctor']);

if (!skipBuild) {
  console.log('\nBuilding production app...');
  // next build can exhaust the default 1.5 GB V8 heap on machines with 4-8 GB RAM.
  // Raise the ceiling to 4 GB; this is harmless on machines with more memory.
  const buildEnv = {
    ...process.env,
    NODE_OPTIONS: [process.env.NODE_OPTIONS, '--max-old-space-size=4096'].filter(Boolean).join(' '),
  };
  run(npmCmd, ['run', 'build'], { env: buildEnv });
}

console.log('\nBootstrap complete.');
console.log('Optional OCR helpers: macOS "brew install poppler tesseract"; Windows install Poppler and Tesseract OCR and add them to PATH.');
console.log('Start Career Seek with: npm run launch');
console.log('Open: http://localhost:3000');
