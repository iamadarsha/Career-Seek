/**
 * failsafe.mjs
 *
 * Universal failsafe orchestration library for Career Seek.
 *
 * Provides:
 *   - retryAsync()          : retry any async operation with backoff
 *   - withFallback()        : try primary, fall back to secondary
 *   - checkDiskSpace()      : guard against low-disk installs
 *   - checkNetworkAccess()  : early exit if completely offline
 *   - checkNpmRegistry()    : verify npm registry reachable; suggest mirror
 *   - repairNodeModules()   : detect and heal broken node_modules
 *   - repairNativeAddon()   : rebuild better-sqlite3 on mismatch
 *   - ensurePortFree()      : free port or find alternative, write .env.local
 *   - safeNpmInstall()      : npm install/ci with retry + heap flag
 *   - safeBuild()           : next build with OOM guard + retry
 *   - verifyInstall()       : post-install smoke test
 *   - printInstallSummary() : final human-readable banner
 *
 * All functions are non-fatal unless `fatal: true` is passed.
 * Designed to be imported by bootstrap.mjs, launch.mjs, and the
 * platform installers via `node -e`.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync, execFileSync } from 'child_process';
import { createServer } from 'net';
import { fileURLToPath } from 'url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const isWindows = process.platform === 'win32';
export const isMac = process.platform === 'darwin';
export const npmCmd = isWindows ? 'npm.cmd' : 'npm';
export const npxCmd = isWindows ? 'npx.cmd' : 'npx';

// ─── colour helpers (work even in dumb terminals) ────────────────────────────
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};
const useColor = process.stdout.isTTY;
const c = (code, str) => useColor ? `${code}${str}${C.reset}` : str;
export const info  = (msg) => console.log(c(C.cyan,   `[Career Seek] ${msg}`));
export const ok    = (msg) => console.log(c(C.green,  `[Career Seek] ✓ ${msg}`));
export const warn  = (msg) => console.warn(c(C.yellow, `[Career Seek] ⚠ ${msg}`));
export const fail  = (msg) => console.error(c(C.red,   `[Career Seek] ✗ ${msg}`));
export const step  = (msg) => console.log(c(C.bold,   `\n[Career Seek] ── ${msg} ──`));

// ─── retryAsync ──────────────────────────────────────────────────────────────
/**
 * Retry an async function up to `attempts` times with exponential backoff.
 * @param {() => Promise<any>} fn
 * @param {{ attempts?: number, delayMs?: number, label?: string }} opts
 */
export async function retryAsync(fn, { attempts = 3, delayMs = 2000, label = 'operation' } = {}) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts) {
        warn(`${label} failed (attempt ${i}/${attempts}): ${err.message}. Retrying in ${delayMs * i}ms…`);
        await new Promise((r) => setTimeout(r, delayMs * i));
      }
    }
  }
  throw lastErr;
}

// ─── withFallback ─────────────────────────────────────────────────────────────
/**
 * Try primaryFn; if it throws, run fallbackFn.
 * Returns { value, usedFallback }.
 */
export async function withFallback(primaryFn, fallbackFn, label = 'step') {
  try {
    const value = await primaryFn();
    return { value, usedFallback: false };
  } catch (primaryErr) {
    warn(`${label} primary path failed: ${primaryErr.message}. Trying fallback…`);
    try {
      const value = await fallbackFn(primaryErr);
      return { value, usedFallback: true };
    } catch (fallbackErr) {
      throw new Error(
        `Both primary and fallback for "${label}" failed.\n` +
        `  Primary  : ${primaryErr.message}\n` +
        `  Fallback : ${fallbackErr.message}`,
      );
    }
  }
}

// ─── checkDiskSpace ───────────────────────────────────────────────────────────
/**
 * Warn (or fail) if free disk space is below minGb gigabytes.
 * Uses `df` on Unix and `wmic` on Windows.
 */
export function checkDiskSpace(minGb = 3, fatal = false) {
  try {
    let freeBytes = 0;
    if (isWindows) {
      const drive = root.slice(0, 2); // e.g. "C:"
      const result = spawnSync(
        'powershell.exe',
        ['-NoProfile', '-Command',
          `(Get-PSDrive -Name ${drive[0]}).Free`],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      );
      freeBytes = Number((result.stdout || '0').trim());
    } else {
      const result = spawnSync('df', ['-k', root], {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      });
      const lines = (result.stdout || '').trim().split('\n');
      const cols = (lines[1] || '').trim().split(/\s+/);
      freeBytes = Number(cols[3] || 0) * 1024; // df -k reports KiB
    }

    const freeGb = freeBytes / 1024 ** 3;
    if (freeGb < minGb) {
      const msg =
        `Low disk space: ${freeGb.toFixed(1)} GB free, ${minGb} GB recommended.\n` +
        '  Career Seek needs ~2.5 GB for node_modules + Playwright + native binaries.\n' +
        '  Free up disk space before continuing.';
      if (fatal) { fail(msg); process.exit(1); }
      warn(msg);
      return false;
    }
    ok(`Disk space: ${freeGb.toFixed(1)} GB free.`);
    return true;
  } catch {
    warn('Could not determine free disk space — continuing anyway.');
    return true;
  }
}

// ─── checkNetworkAccess ───────────────────────────────────────────────────────
/**
 * Check that the machine can reach GitHub and the npm registry.
 * Returns { github: bool, npm: bool }.
 */
export async function checkNetworkAccess() {
  async function ping(url) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(6000), method: 'HEAD' });
      return res.status < 500;
    } catch {
      return false;
    }
  }

  const [github, npmReg] = await Promise.all([
    ping('https://github.com'),
    ping('https://registry.npmjs.org'),
  ]);

  if (!github) {
    warn(
      'GitHub is not reachable. git clone / binary downloads may fail.\n' +
      '  If you are behind a corporate proxy, set:\n' +
      '    export HTTPS_PROXY=http://proxy.company.com:8080\n' +
      '    git config --global http.proxy http://proxy.company.com:8080',
    );
  } else {
    ok('GitHub is reachable.');
  }

  if (!npmReg) {
    warn(
      'npm registry (registry.npmjs.org) is not reachable.\n' +
      '  If you are on a restricted network, try a mirror:\n' +
      '    npm config set registry https://registry.npmmirror.com  (China / restricted networks)\n' +
      '  Or configure the npm proxy:\n' +
      '    npm config set proxy http://proxy.company.com:8080\n' +
      '    npm config set https-proxy http://proxy.company.com:8080',
    );
  } else {
    ok('npm registry is reachable.');
  }

  return { github, npm: npmReg };
}

// ─── checkNpmRegistry ─────────────────────────────────────────────────────────
/** Lightweight alias used before npm install steps. */
export async function checkNpmRegistry() {
  const { npm } = await checkNetworkAccess();
  return npm;
}

// ─── repairNodeModules ────────────────────────────────────────────────────────
/**
 * Detects a broken node_modules (missing .bin/next, version stamp mismatch, etc.)
 * and runs `npm install` to repair it.
 */
export function repairNodeModules() {
  const nodeModulesOk =
    fs.existsSync(path.join(root, 'node_modules', '.bin', isWindows ? 'next.cmd' : 'next')) &&
    fs.existsSync(path.join(root, 'node_modules', 'next', 'package.json'));

  if (nodeModulesOk) return false; // nothing to do

  warn('node_modules appears incomplete or missing. Running npm install to repair…');
  const pkgLockPath = path.join(root, 'package-lock.json');
  const installArgs = fs.existsSync(pkgLockPath) ? ['ci'] : ['install'];
  const result = spawnSync(npmCmd, installArgs, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' },
  });
  if (result.status !== 0) {
    throw new Error('npm install failed during node_modules repair. See output above.');
  }
  ok('node_modules repaired.');
  return true;
}

// ─── repairNativeAddon ────────────────────────────────────────────────────────
/**
 * Attempts to load better-sqlite3 and auto-rebuilds if it fails.
 * Returns true if addon is usable after the call.
 */
export async function repairNativeAddon() {
  try {
    await import('better-sqlite3');
    ok('better-sqlite3 native addon loads correctly.');
    return true;
  } catch (loadErr) {
    warn(`better-sqlite3 failed to load: ${loadErr.message}`);
    info('Attempting automatic rebuild (npm rebuild better-sqlite3)…');
    const result = spawnSync(npmCmd, ['rebuild', 'better-sqlite3'], {
      cwd: root,
      stdio: 'inherit',
      env: {
        ...process.env,
        // Ensure node-gyp can find Python on Windows
        ...(isWindows ? { npm_config_python: process.env.PYTHON || 'python' } : {}),
      },
    });
    if (result.status === 0) {
      ok('better-sqlite3 rebuilt successfully.');
      return true;
    }
    fail(
      'better-sqlite3 could not be rebuilt. The C++ build toolchain is missing.\n' +
      (isMac
        ? '  Fix: xcode-select --install'
        : isWindows
          ? '  Fix: Run this in an Administrator PowerShell:\n' +
            '       npm install --global windows-build-tools\n' +
            '  Or install Visual Studio Build Tools from:\n' +
            '       https://aka.ms/vs/17/release/vs_BuildTools.exe'
          : '  Fix: sudo apt-get install -y build-essential python3\n' +
            '       (or equivalent for your distro)'),
    );
    return false;
  }
}

// ─── ensurePortFree ───────────────────────────────────────────────────────────
/**
 * Check if `port` is free. If not, find the next free port and write it
 * to .env.local under `envKey`. Returns the port that will be used.
 */
export async function ensurePortFree(port, envKey, label = 'service') {
  const busy = await new Promise((resolve) => {
    const srv = createServer();
    srv.listen(port, '127.0.0.1', () => { srv.close(() => resolve(false)); });
    srv.on('error', () => resolve(true));
  });

  if (!busy) return port;

  // Find next free port
  const freePort = await new Promise((resolve) => {
    function tryPort(p) {
      const srv = createServer();
      srv.listen(p, '127.0.0.1', () => { srv.close(() => resolve(p)); });
      srv.on('error', () => tryPort(p + 1));
    }
    tryPort(port + 1);
  });

  warn(`${label} port ${port} is busy. Using port ${freePort} instead.`);

  // Write to .env.local
  const envPath = path.join(root, '.env.local');
  const content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const lines = content.split('\n');
  const idx = lines.findIndex((l) => l.startsWith(`${envKey}=`));
  const newLine = `${envKey}=${freePort}`;
  if (idx >= 0) { lines[idx] = newLine; }
  else {
    if (lines.length && lines[lines.length - 1] !== '') lines.push('');
    lines.push(newLine);
  }
  fs.writeFileSync(envPath, lines.join('\n'));
  process.env[envKey] = String(freePort);
  ok(`Wrote ${envKey}=${freePort} to .env.local.`);
  return freePort;
}

// ─── safeNpmInstall ───────────────────────────────────────────────────────────
/**
 * Run npm install (or npm ci if lockfile exists) with:
 *   - --max-old-space-size=4096 to prevent OOM on low-RAM machines
 *   - 3x retry on network failure
 *   - fallback from `npm ci` to `npm install` if ci fails (e.g. lockfile drift)
 */
export async function safeNpmInstall() {
  step('Installing npm dependencies');
  const pkgLockPath = path.join(root, 'package-lock.json');
  const hasLock = fs.existsSync(pkgLockPath);

  const env = {
    ...process.env,
    NODE_OPTIONS: [process.env.NODE_OPTIONS, '--max-old-space-size=4096'].filter(Boolean).join(' '),
  };

  async function tryInstall(args) {
    return retryAsync(
      () => {
        const result = spawnSync(npmCmd, args, { cwd: root, stdio: 'inherit', env });
        if (result.error) throw result.error;
        if (result.status !== 0) throw new Error(`npm ${args.join(' ')} exited with code ${result.status}`);
      },
      { attempts: 3, delayMs: 3000, label: `npm ${args[0]}` },
    );
  }

  if (hasLock) {
    await withFallback(
      () => tryInstall(['ci']),
      () => {
        warn('npm ci failed (likely lockfile drift after a git pull). Falling back to npm install…');
        return tryInstall(['install']);
      },
      'npm dependency installation',
    );
  } else {
    await tryInstall(['install']);
  }
  ok('npm dependencies installed.');
}

// ─── safeBuild ────────────────────────────────────────────────────────────────
/**
 * Run `next build` with:
 *   - 4 GB Node heap to prevent OOM on 4–8 GB machines
 *   - skip if .next/BUILD_ID already exists and skipIfBuilt=true
 *   - 2x retry on transient build failure
 */
export async function safeBuild({ skipIfBuilt = true } = {}) {
  const buildIdPath = path.join(root, '.next', 'BUILD_ID');
  if (skipIfBuilt && fs.existsSync(buildIdPath)) {
    ok('Production build already exists — skipping rebuild.');
    return;
  }

  step('Building production app (this takes 1–3 minutes)');
  const buildEnv = {
    ...process.env,
    NODE_OPTIONS: [process.env.NODE_OPTIONS, '--max-old-space-size=4096'].filter(Boolean).join(' '),
  };

  await retryAsync(
    () => {
      const result = spawnSync(npmCmd, ['run', 'build'], { cwd: root, stdio: 'inherit', env: buildEnv });
      if (result.error) throw result.error;
      if (result.status !== 0) throw new Error(`next build exited with code ${result.status}`);
    },
    { attempts: 2, delayMs: 5000, label: 'next build' },
  );
  ok('Production build complete.');
}

// ─── verifyInstall ────────────────────────────────────────────────────────────
/**
 * Post-install smoke tests. Returns a list of failed checks.
 */
export async function verifyInstall() {
  const failures = [];

  // 1. node_modules/next present
  if (!fs.existsSync(path.join(root, 'node_modules', 'next', 'package.json'))) {
    failures.push('node_modules/next is missing — npm install may have failed.');
  }

  // 2. better-sqlite3 loadable
  try { await import('better-sqlite3'); }
  catch (e) { failures.push(`better-sqlite3 not loadable: ${e.message}`); }

  // 3. .env.local exists and has REDIS_URL
  const envPath = path.join(root, '.env.local');
  if (!fs.existsSync(envPath)) {
    failures.push('.env.local is missing. Run npm run bootstrap.');
  } else {
    const envContent = fs.readFileSync(envPath, 'utf8');
    if (!envContent.includes('REDIS_URL=')) {
      failures.push('.env.local is missing REDIS_URL. Run npm run bootstrap.');
    }
  }

  // 4. SQLite DB directory writable
  const dbDir = path.join(
    process.env.JOBHUNT_DATA_DIR || path.join(os.homedir(), '.jobhunt-india'),
    'db',
  );
  try {
    fs.mkdirSync(dbDir, { recursive: true });
    const probe = path.join(dbDir, `.probe-${Date.now()}`);
    fs.writeFileSync(probe, '');
    fs.unlinkSync(probe);
  } catch (e) {
    failures.push(`Data directory not writable (${dbDir}): ${e.message}`);
  }

  // 5. Native binaries manifest exists
  const manifestPath = path.join(root, 'binaries', 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    failures.push('binaries/manifest.json is missing. Native services (Redis, Meilisearch) may not start.');
  }

  return failures;
}

// ─── printInstallSummary ──────────────────────────────────────────────────────
/**
 * Print a final human-friendly summary banner.
 * @param {{ failures: string[], warnings: string[], port: number }} opts
 */
export function printInstallSummary({ failures = [], warnings = [], port = 3000 } = {}) {
  console.log('');
  console.log(c(C.bold, '═══════════════════════════════════════════════'));
  if (failures.length === 0) {
    console.log(c(C.green, c(C.bold, '  Career Seek is ready!')));
    console.log(c(C.cyan,  `  Open: http://localhost:${port}`));
    console.log(c(C.cyan,  `  Docs: https://github.com/iamadarsha/Career-Seek#readme`));
  } else {
    console.log(c(C.red,    c(C.bold, '  Career Seek setup completed with issues:')));
    failures.forEach((f) => console.error(c(C.red, `    ✗ ${f}`)));
  }
  if (warnings.length > 0) {
    console.log(c(C.yellow, '  Warnings (non-blocking):'));
    warnings.forEach((w) => console.warn(c(C.yellow, `    ⚠ ${w}`)));
  }
  console.log(c(C.bold, '═══════════════════════════════════════════════'));
  console.log('');

  if (failures.length === 0) {
    console.log('  Commands:');
    console.log('    npm run launch         — start Career Seek');
    console.log('    npm run preflight      — run all health checks');
    console.log('    npm run doctor         — diagnose runtime issues');
    console.log('    npm run bootstrap -- --repair  — repair install');
  }
  console.log('');
}

// ─── runFullFailsafe ──────────────────────────────────────────────────────────
/**
 * All-in-one failsafe runner called from platform installers.
 * Runs every guard in the correct order and collects results.
 */
export async function runFullFailsafe({ skipBuild = false } = {}) {
  const warnings = [];
  const failures = [];

  step('Running environment preflight checks');

  // 1. Node version (early gate)
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  if (nodeMajor < 20 || nodeMajor >= 26) {
    fail(`Node.js ${process.version} is not supported. Requires >=20 and <26.`);
    fail('Install Node 22 LTS: https://nodejs.org');
    process.exit(1);
  }
  ok(`Node.js ${process.version}`);

  // 2. Disk space
  checkDiskSpace(3, false);

  // 3. Network
  await checkNetworkAccess();

  // 4. npm install with retry + fallback
  try {
    await safeNpmInstall();
  } catch (err) {
    failures.push(`npm install failed: ${err.message}`);
    fail(err.message);
    fail('Try running: npm install manually, then npm run bootstrap');
  }

  // 5. Repair native addon
  const sqliteOk = await repairNativeAddon();
  if (!sqliteOk) {
    warnings.push('better-sqlite3 native addon could not be loaded — database features degraded.');
  }

  // 6. Port safety for Bull Board
  try {
    await ensurePortFree(
      Number(process.env.BULL_BOARD_PORT || 3002),
      'BULL_BOARD_PORT',
      'Bull Board',
    );
  } catch (err) {
    warnings.push(`Bull Board port check failed: ${err.message}`);
  }

  // 7. Build
  if (!skipBuild) {
    try {
      await safeBuild({ skipIfBuilt: true });
    } catch (err) {
      failures.push(`Build failed: ${err.message}`);
    }
  }

  // 8. Verify
  step('Verifying installation');
  const verifyFailures = await verifyInstall();
  failures.push(...verifyFailures);
  if (verifyFailures.length === 0) ok('All install checks passed.');
  else verifyFailures.forEach((f) => fail(f));

  return { failures, warnings };
}
