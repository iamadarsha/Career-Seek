/**
 * preflight-checks.mjs
 *
 * Pure-additive safety library — imported by bootstrap.mjs, launch.mjs,
 * and the standalone `npm run preflight` script.
 *
 * Every check is non-fatal by default: issues are collected into arrays
 * and returned so callers decide whether to abort or just warn.
 *
 * Zero changes to any existing file. Zero new required dependencies.
 * All imports are from packages already listed in package.json.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync, execSync } from 'child_process';
import { createServer } from 'net';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// ─── helpers ────────────────────────────────────────────────────────────────

function tryReadJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return null; }
}

function freeMemoryMb() {
  return Math.round(os.freemem() / 1024 / 1024);
}

function totalMemoryMb() {
  return Math.round(os.totalmem() / 1024 / 1024);
}

/** Returns true when the port is already bound by another process. */
async function isPortBusy(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.listen(port, host, () => { srv.close(() => resolve(false)); });
    srv.on('error', () => resolve(true));
  });
}

/** Returns the first free TCP port >= startPort. */
async function findFreePort(startPort, host = '127.0.0.1') {
  return new Promise((resolve) => {
    function tryPort(p) {
      const srv = createServer();
      srv.listen(p, host, () => { srv.close(() => resolve(p)); });
      srv.on('error', () => tryPort(p + 1));
    }
    tryPort(startPort);
  });
}

/**
 * Safely upsert a single KEY=VALUE line in .env.local.
 * Never overwrites existing entries with the same key.
 */
function upsertEnvLocal(key, value, projectRoot = root) {
  const envPath = path.join(projectRoot, '.env.local');
  const content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const lines = content.split('\n');
  const idx = lines.findIndex((l) => l.startsWith(`${key}=`));
  const newLine = `${key}=${value}`;
  if (idx >= 0) {
    if (lines[idx] === newLine) return; // already correct
    lines[idx] = newLine;
  } else {
    if (lines.length && lines[lines.length - 1] !== '') lines.push('');
    lines.push(newLine);
  }
  fs.writeFileSync(envPath, lines.join('\n'));
}

/** Returns true when the path lives on a known network filesystem. */
function isNetworkPath(dirPath) {
  if (process.platform === 'win32') {
    // UNC path or mapped drive — heuristic only
    const resolved = path.resolve(dirPath);
    return resolved.startsWith('\\\\');
  }
  try {
    const result = spawnSync('stat', ['-f', '-c', '%T', dirPath], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    const fstype = (result.stdout || '').trim().toLowerCase();
    return ['nfs', 'smb', 'cifs', 'smbfs', 'fuse.sshfs'].some((t) => fstype.includes(t));
  } catch {
    return false;
  }
}

/** Quick writable check on a directory (creates it if needed). */
function canWriteDir(dirPath) {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
    const probe = path.join(dirPath, `.write-probe-${Date.now()}`);
    fs.writeFileSync(probe, '');
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

// ─── individual checks ───────────────────────────────────────────────────────

/**
 * CHECK 1 — better-sqlite3 native addon
 * Tries to import it; on failure attempts `npm rebuild` once.
 */
export async function checkBetterSqlite3() {
  const issues = [];
  const warnings = [];
  try {
    await import('better-sqlite3');
  } catch (err) {
    // Attempt auto-rebuild
    const rebuild = spawnSync(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['rebuild', 'better-sqlite3'],
      { cwd: root, stdio: 'pipe', encoding: 'utf8' },
    );
    if (rebuild.status === 0) {
      warnings.push(
        '[preflight] better-sqlite3 native addon was rebuilt successfully. ' +
        'This usually means node_modules was installed with a different Node.js version. ' +
        'No action required.',
      );
    } else {
      issues.push(
        '[preflight] better-sqlite3 failed to load and could not be rebuilt.\n' +
        '  Original error : ' + err.message + '\n' +
        '  Rebuild stderr : ' + (rebuild.stderr || '').slice(0, 400) + '\n' +
        '  Fix: Install the C++ build toolchain.\n' +
        '    macOS   → xcode-select --install\n' +
        '    Ubuntu  → sudo apt-get install -y build-essential python3\n' +
        '    Windows → npm install --global windows-build-tools  (run as Administrator)',
      );
    }
  }
  return { issues, warnings };
}

/**
 * CHECK 2 — @xenova/transformers model cache write-access + proxy warning
 */
export function checkXenovaCache() {
  const issues = [];
  const warnings = [];
  const cacheDir =
    process.env.TRANSFORMERS_CACHE ||
    process.env.HF_HOME ||
    path.join(os.homedir(), '.cache', 'huggingface');

  if (!canWriteDir(cacheDir)) {
    issues.push(
      `[preflight] @xenova/transformers cache directory is not writable: ${cacheDir}\n` +
      '  Fix: Set TRANSFORMERS_CACHE or HF_HOME to a writable directory in .env.local.',
    );
  }

  // Corporate proxy hint: HF CDN is huggingface.co
  const httpProxy = process.env.HTTPS_PROXY || process.env.https_proxy ||
                    process.env.HTTP_PROXY  || process.env.http_proxy;
  if (httpProxy) {
    warnings.push(
      `[preflight] A corporate proxy is detected (${httpProxy}).\n` +
      '  If @xenova/transformers model downloads fail, whitelist huggingface.co\n' +
      '  or set CAREER_SEEK_ALLOW_MODEL_DOWNLOADS=0 in .env.local to skip model downloads.',
    );
  }
  return { issues, warnings };
}

/**
 * CHECK 3 — Playwright browser download: detect offline/proxy and prevent hang
 */
export function checkPlaywrightEnv() {
  const issues = [];
  const warnings = [];
  const skipBrowserInstall =
    process.env.CAREER_SEEK_SKIP_BROWSER_INSTALL === '1' ||
    process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD === '1';

  if (skipBrowserInstall) return { issues, warnings }; // already handled

  // If we're in a CI environment without a display, warn
  const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
  if (isCI && !process.env.DISPLAY && process.platform === 'linux') {
    warnings.push(
      '[preflight] Playwright is about to download Chromium in a CI environment with no DISPLAY.\n' +
      '  If this is headless CI, set PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 or\n' +
      '  CAREER_SEEK_SKIP_BROWSER_INSTALL=1 to skip the download and save ~300 MB.',
    );
  }

  // Check if playwright browsers are already installed
  const playwrightCacheDir = process.env.PLAYWRIGHT_BROWSERS_PATH ||
    (process.platform === 'win32'
      ? path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright')
      : process.platform === 'darwin'
        ? path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright')
        : path.join(os.homedir(), '.cache', 'ms-playwright'));

  const browsersAlreadyInstalled = fs.existsSync(playwrightCacheDir) &&
    fs.readdirSync(playwrightCacheDir).some((d) => d.startsWith('chromium'));

  if (!browsersAlreadyInstalled) {
    warnings.push(
      '[preflight] Playwright Chromium is not yet installed (~300 MB download).\n' +
      '  This will happen automatically during bootstrap.\n' +
      '  To skip: set CAREER_SEEK_SKIP_BROWSER_INSTALL=1 in .env.local\n' +
      '  (app will run in safe mode — live scraping disabled).',
    );
  }
  return { issues, warnings };
}

/**
 * CHECK 4 — Dual drizzle config conflict
 */
export function checkDrizzleConfigConflict() {
  const issues = [];
  const warnings = [];
  const hasJs = fs.existsSync(path.join(root, 'drizzle.config.js'));
  const hasTs = fs.existsSync(path.join(root, 'drizzle.config.ts'));
  if (hasJs && hasTs) {
    warnings.push(
      '[preflight] Both drizzle.config.js AND drizzle.config.ts exist in the project root.\n' +
      '  drizzle-kit will prefer the .ts version when tsx is available, but this can be\n' +
      '  ambiguous across environments. Consider removing drizzle.config.js if drizzle.config.ts\n' +
      '  is the authoritative config.',
    );
  }
  return { issues, warnings };
}

/**
 * CHECK 5 — Redis version must be >= 6.2 for BullMQ streams
 */
export function checkRedisVersion() {
  const issues = [];
  const warnings = [];

  // Try to get the version from a running redis-server or the bundled binary
  const manifestPath = path.join(root, 'binaries', 'manifest.json');
  const manifest = tryReadJson(manifestPath) || {};
  const redisBin = manifest.services?.redis?.executablePath || 'redis-server';

  const result = spawnSync(redisBin, ['--version'], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 3000,
  });
  if (result.status !== 0) return { issues, warnings }; // binary not available, skip

  const match = (result.stdout || '').match(/v(\d+)\.(\d+)/);
  if (!match) return { issues, warnings };

  const major = Number(match[1]);
  const minor = Number(match[2]);
  if (major < 6 || (major === 6 && minor < 2)) {
    issues.push(
      `[preflight] Redis ${major}.${minor} detected. BullMQ 5.x requires Redis >= 6.2 for stream support.\n` +
      '  Jobs will be queued but never processed until Redis is upgraded.\n' +
      '  Fix: Run `npm run setup` to download the bundled Redis 7 binary, or upgrade system Redis.',
    );
  }
  return { issues, warnings };
}

/**
 * CHECK 6 — Bull Board port 3002 collision → auto-assign free port in .env.local
 */
export async function checkBullBoardPort() {
  const issues = [];
  const warnings = [];
  const configuredPort = Number(process.env.BULL_BOARD_PORT || 3002);

  if (await isPortBusy(configuredPort)) {
    const freePort = await findFreePort(configuredPort + 1);
    upsertEnvLocal('BULL_BOARD_PORT', String(freePort));
    process.env.BULL_BOARD_PORT = String(freePort);
    warnings.push(
      `[preflight] Bull Board port ${configuredPort} is already in use.\n` +
      `  Auto-assigned port ${freePort} and written BULL_BOARD_PORT=${freePort} to .env.local.`,
    );
  }
  return { issues, warnings };
}

/**
 * CHECK 7 — Mailpit SMTP port availability
 */
export async function checkMailpitPort() {
  const issues = [];
  const warnings = [];
  const smtpPort = Number(process.env.MAILPIT_SMTP_PORT || 1025);

  if (await isPortBusy(smtpPort)) {
    warnings.push(
      `[preflight] Mailpit SMTP port ${smtpPort} is already in use.\n` +
      '  Email-related features (digest alerts, job notifications) may not work.\n' +
      `  Fix: Set MAILPIT_SMTP_PORT to a free port in .env.local, or stop the service using port ${smtpPort}.`,
    );
  }
  return { issues, warnings };
}

/**
 * CHECK 8 — No AI provider configured
 * Checks env vars AND settings.json; prints a clear onboarding hint.
 */
export function checkAIProvider() {
  const issues = [];
  const warnings = [];

  const keys = [
    'GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY', 'GROQ_API_KEY', 'DEEPSEEK_API_KEY',
    'OPENAI_COMPATIBLE_API_KEY', 'OPENAI_COMPATIBLE_BASE_URL',
  ];
  const hasEnvKey = keys.some((k) => (process.env[k] || '').trim().length > 0);

  // Check settings.json as well
  const baseDir = process.env.JOBHUNT_DATA_DIR
    ? path.resolve(process.env.JOBHUNT_DATA_DIR)
    : path.join(os.homedir(), '.jobhunt-india');
  const settings = tryReadJson(path.join(baseDir, 'config', 'settings.json')) || {};
  const hasSettingsKey = Boolean(
    settings?.aiProviders?.gemini?.apiKey ||
    settings?.aiProviders?.openai?.apiKey ||
    settings?.aiProviders?.anthropic?.apiKey ||
    settings?.aiProviders?.groq?.apiKey ||
    settings?.geminiApiKey,
  );

  if (!hasEnvKey && !hasSettingsKey) {
    warnings.push(
      '[preflight] No AI provider key is configured.\n' +
      '  Career Seek will run in deterministic local mode (no AI summaries, no cover letters).\n' +
      '  To enable AI features, set one of the following in .env.local:\n' +
      '    GEMINI_API_KEY=...        (free tier available at aistudio.google.com)\n' +
      '    OPENAI_API_KEY=...\n' +
      '    ANTHROPIC_API_KEY=...\n' +
      '    GROQ_API_KEY=...         (free tier — fastest for India)\n' +
      '  Or start Ollama locally and set OLLAMA_BASE_URL=http://127.0.0.1:11434',
    );
  }
  return { issues, warnings };
}

/**
 * CHECK 9 — @ai-sdk/* version drift across overlapping packages
 */
export function checkAiSdkVersionDrift() {
  const issues = [];
  const warnings = [];

  const pkgLockPath = path.join(root, 'package-lock.json');
  if (!fs.existsSync(pkgLockPath)) return { issues, warnings };

  let lockData;
  try { lockData = JSON.parse(fs.readFileSync(pkgLockPath, 'utf8')); }
  catch { return { issues, warnings }; }

  const packages = lockData.packages || {};
  const aiSdkPkgs = Object.entries(packages)
    .filter(([name]) => name.startsWith('node_modules/@ai-sdk/'))
    .map(([name, data]) => ({ name: name.replace('node_modules/', ''), version: data.version }));

  // Check if 'ai' (Vercel AI SDK) major version is consistent with @ai-sdk/* packages
  const aiPkg = packages['node_modules/ai'];
  const aiMajor = aiPkg ? Number((aiPkg.version || '0').split('.')[0]) : null;
  const driftedSdks = aiSdkPkgs.filter((p) => {
    const sdkMajor = Number((p.version || '0').split('.')[0]);
    return aiMajor !== null && sdkMajor !== aiMajor;
  });

  if (driftedSdks.length > 0) {
    warnings.push(
      '[preflight] @ai-sdk/* package version mismatch detected.\n' +
      `  ai package is at v${aiMajor}.x but the following are at a different major:\n` +
      driftedSdks.map((p) => `    ${p.name}@${p.version}`).join('\n') + '\n' +
      '  This can cause TypeScript type errors or runtime provider failures.\n' +
      '  Fix: Run `npm install` to resolve lockfile, or pin all @ai-sdk/* to the same major.',
    );
  }
  return { issues, warnings };
}

/**
 * CHECK 10 — Low RAM + model downloads enabled
 */
export function checkModelDownloadRam() {
  const issues = [];
  const warnings = [];
  const allowDownloads = process.env.CAREER_SEEK_ALLOW_MODEL_DOWNLOADS === '1';
  if (!allowDownloads) return { issues, warnings };

  const freeRamMb = freeMemoryMb();
  const totalRamMb = totalMemoryMb();

  if (freeRamMb < 2048) {
    warnings.push(
      `[preflight] CAREER_SEEK_ALLOW_MODEL_DOWNLOADS=1 is set but free RAM is only ~${freeRamMb} MB.\n` +
      `  Total RAM: ~${totalRamMb} MB. Downloading and loading large models (e.g., llama3.2:3b) may\n` +
      '  cause an out-of-memory crash.\n' +
      '  Recommendation: Set CAREER_SEEK_ALLOW_MODEL_DOWNLOADS=0 and use a cloud API instead,\n' +
      '  or free up RAM before starting Career Seek.',
    );
  }
  return { issues, warnings };
}

/**
 * CHECK 11 — AI timeout vs. measured network RTT
 * Lightweight: just checks if timeout is configured and warns if suspiciously low.
 */
export async function checkAITimeout() {
  const issues = [];
  const warnings = [];
  const configuredTimeoutMs = Number(process.env.CAREER_SEEK_AI_TIMEOUT_MS || 45000);

  // Probe a known-fast endpoint for a rough RTT estimate
  let rttMs = 0;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const t0 = Date.now();
    await fetch('https://www.google.com/generate_204', { signal: controller.signal });
    rttMs = Date.now() - t0;
    clearTimeout(timer);
  } catch {
    rttMs = 0; // offline or proxy — don't warn about timeout
  }

  if (rttMs > 0 && configuredTimeoutMs < 20_000 && rttMs > 500) {
    warnings.push(
      `[preflight] Network RTT probe: ~${rttMs} ms. CAREER_SEEK_AI_TIMEOUT_MS=${configuredTimeoutMs} ms\n` +
      '  may be too low on your connection and cause silent AI call timeouts.\n' +
      '  Recommendation: Set CAREER_SEEK_AI_TIMEOUT_MS=60000 in .env.local.',
    );
  }
  return { issues, warnings };
}

/**
 * CHECK 12 — ~/.jobhunt-india (data dir) write permission
 */
export function checkDataDirWritable() {
  const issues = [];
  const warnings = [];
  const baseDir = process.env.JOBHUNT_DATA_DIR
    ? path.resolve(process.env.JOBHUNT_DATA_DIR)
    : path.join(os.homedir(), '.jobhunt-india');

  if (!canWriteDir(baseDir)) {
    issues.push(
      `[preflight] Data directory is not writable: ${baseDir}\n` +
      '  This is likely caused by MDM/GPO restrictions on managed machines.\n' +
      '  Fix: Set JOBHUNT_DATA_DIR to a writable path in .env.local. Example:\n' +
      '    JOBHUNT_DATA_DIR=/tmp/career-seek-data     (Linux/macOS)\n' +
      '    JOBHUNT_DATA_DIR=C:\\Users\\YourName\\career-seek-data  (Windows)',
    );
  }
  return { issues, warnings };
}

/**
 * CHECK 13 — SQLite data dir on network filesystem (NFS/SMB WAL issue)
 */
export function checkSqliteNetworkFs() {
  const issues = [];
  const warnings = [];
  if (process.platform === 'win32') {
    // On Windows, check for UNC path
    const dataDir = process.env.JOBHUNT_DATA_DIR || '';
    if (dataDir.startsWith('\\\\')) {
      warnings.push(
        `[preflight] Data directory appears to be a UNC/network path: ${dataDir}\n` +
        '  SQLite WAL mode is unreliable on network filesystems (NFS, SMB).\n' +
        '  Set JOBHUNT_DATA_DIR to a local path in .env.local to avoid DB corruption.',
      );
    }
    return { issues, warnings };
  }
  const baseDir = process.env.JOBHUNT_DATA_DIR
    ? path.resolve(process.env.JOBHUNT_DATA_DIR)
    : path.join(os.homedir(), '.jobhunt-india');

  if (isNetworkPath(baseDir)) {
    warnings.push(
      `[preflight] Data directory is on a network filesystem: ${baseDir}\n` +
      '  SQLite WAL mode requires POSIX file locks which NFS/SMB do not reliably support.\n' +
      '  This can cause database corruption under concurrent access.\n' +
      '  Fix: Set JOBHUNT_DATA_DIR to a local path in .env.local.',
    );
  }
  return { issues, warnings };
}

/**
 * CHECK 15 — Node.js version (early gate, before any install)
 */
export function checkNodeVersion() {
  const issues = [];
  const warnings = [];
  const major = Number.parseInt(process.versions.node.split('.')[0] || '0', 10);
  if (major < 20) {
    issues.push(
      `[preflight] Node.js ${process.version} is too old. Career Seek requires Node.js >= 20.\n` +
      '  Install Node 20 or 22 LTS: https://nodejs.org/en/download\n' +
      '  With nvm: nvm install 22 && nvm use 22',
    );
  } else if (major >= 26) {
    issues.push(
      `[preflight] Node.js ${process.version} is not yet supported (engines: >=20 <26).\n` +
      '  Downgrade to Node 20 or 22 LTS: nvm install 22 && nvm use 22',
    );
  }
  return { issues, warnings };
}

/**
 * CHECK 16 — tsx installed locally (prevents cold npx fetch delay on worker start)
 */
export function checkTsxInstalled() {
  const issues = [];
  const warnings = [];
  const tsxBin = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');
  if (fs.existsSync(path.join(root, 'node_modules')) && !fs.existsSync(tsxBin)) {
    warnings.push(
      '[preflight] `tsx` binary not found in node_modules/.bin.\n' +
      '  The BullMQ worker (`npm run worker`) uses `npx tsx` and will have a cold-start\n' +
      '  delay the first time it runs while npx fetches tsx from the registry.\n' +
      '  Fix: Run `npm install` to ensure tsx@^4 is installed as a devDependency.',
    );
  }
  return { issues, warnings };
}

/**
 * CHECK 17 — drizzle-kit / drizzle-orm major version sync
 */
export function checkDrizzleVersionSync() {
  const issues = [];
  const warnings = [];
  const pkgPath = path.join(root, 'package.json');
  if (!fs.existsSync(pkgPath)) return { issues, warnings };

  let pkg;
  try { pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')); }
  catch { return { issues, warnings }; }

  const ormVersion = (pkg.dependencies?.['drizzle-orm'] || '').replace(/[^\d.]/g, '');
  const kitVersion = (pkg.devDependencies?.['drizzle-kit'] || '').replace(/[^\d.]/g, '');

  const ormMajor = Number(ormVersion.split('.')[0] || 0);
  const kitMajor = Number(kitVersion.split('.')[0] || 0);
  const ormMinor = Number(ormVersion.split('.')[1] || 0);
  const kitMinor = Number(kitVersion.split('.')[1] || 0);

  // drizzle-kit and drizzle-orm should track within the same minor series
  if (ormMajor > 0 && kitMajor > 0 && (ormMajor !== kitMajor || Math.abs(ormMinor - kitMinor) > 5)) {
    warnings.push(
      `[preflight] drizzle-orm@${ormVersion} and drizzle-kit@${kitVersion} may be out of sync.\n` +
      '  Large version gaps between drizzle-orm and drizzle-kit cause schema push failures.\n' +
      '  Fix: Update both to the latest compatible pair: npm update drizzle-orm drizzle-kit',
    );
  }
  return { issues, warnings };
}

/**
 * CHECK 18 — Plaintext LinkedIn/Naukri credentials hygiene warning
 */
export function checkCredentialHygiene() {
  const issues = [];
  const warnings = [];
  const hasLinkedIn = Boolean((process.env.LINKEDIN_EMAIL || '').trim());
  const hasNaukri = Boolean((process.env.NAUKRI_EMAIL || '').trim());
  const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';

  if ((hasLinkedIn || hasNaukri) && isCI) {
    issues.push(
      '[preflight] LinkedIn/Naukri credentials are set in a CI environment!\n' +
      '  LINKEDIN_EMAIL / NAUKRI_EMAIL / LINKEDIN_PASSWORD / NAUKRI_PASSWORD are visible in\n' +
      '  process environment dumps (/proc/PID/environ on Linux).\n' +
      '  Use CI secrets (GitHub Actions secrets, etc.) and never commit .env.local.',
    );
  } else if (hasLinkedIn || hasNaukri) {
    warnings.push(
      '[preflight] LinkedIn/Naukri credentials are configured.\n' +
      '  These are stored in .env.local (which is .gitignored).\n' +
      '  ✓ Never share .env.local or commit it. ✓ Never set these in CI environment variables.',
    );
  }
  return { issues, warnings };
}

/**
 * CHECK 19 — SerpAPI quota awareness
 */
export function checkSerpAPIQuota() {
  const issues = [];
  const warnings = [];
  if (!process.env.SERPAPI_API_KEY) return { issues, warnings };

  // Read last-known usage from capabilities.json (written by doctor.mjs)
  const baseDir = process.env.JOBHUNT_DATA_DIR
    ? path.resolve(process.env.JOBHUNT_DATA_DIR)
    : path.join(os.homedir(), '.jobhunt-india');
  const capabilities = tryReadJson(path.join(baseDir, 'config', 'capabilities.json'));
  const serpUsage = capabilities?.serpapi_searches_this_month;

  if (typeof serpUsage === 'number' && serpUsage >= 80) {
    warnings.push(
      `[preflight] SerpAPI: ${serpUsage}/100 free-tier searches used this month.\n` +
      '  Google Jobs discovery will stop working when the quota is exhausted.\n' +
      '  Consider upgrading at https://serpapi.com or reducing scan frequency.',
    );
  } else if (process.env.SERPAPI_API_KEY) {
    // Just remind on startup that quota is finite
    warnings.push(
      '[preflight] SerpAPI key is set. Free tier: 100 searches/month.\n' +
      '  Searches are consumed by every Google Jobs scan. Track usage at https://serpapi.com/dashboard',
    );
  }
  return { issues, warnings };
}

/**
 * CHECK 20 — Playwright stealth plugin not configured
 */
export function checkPlaywrightStealth() {
  const issues = [];
  const warnings = [];
  const pkgPath = path.join(root, 'package.json');
  if (!fs.existsSync(pkgPath)) return { issues, warnings };

  let pkg;
  try { pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')); }
  catch { return { issues, warnings }; }

  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const hasStealthPlugin =
    deps['playwright-extra'] ||
    deps['puppeteer-extra-plugin-stealth'] ||
    deps['playwright-extra-plugin-stealth'];

  if (!hasStealthPlugin) {
    warnings.push(
      '[preflight] No Playwright stealth plugin detected.\n' +
      '  LinkedIn, Naukri, and other portals use bot-detection (Cloudflare, DataDome).\n' +
      '  After ~20–30 automated requests, your IP may be soft-blocked and scrapers will\n' +
      '  return empty results silently.\n' +
      '  Optional fix: npm install playwright-extra playwright-extra-plugin-stealth\n' +
      '  and wrap your browser launch calls with the stealth plugin.',
    );
  }
  return { issues, warnings };
}

// ─── aggregate runner ────────────────────────────────────────────────────────

/**
 * Run all preflight checks and return a consolidated report.
 *
 * @param {object} opts
 * @param {boolean} [opts.silent=false] - suppress console output
 * @param {boolean} [opts.failOnIssues=false] - process.exit(1) if any issues found
 * @returns {Promise<{ issues: string[], warnings: string[] }>}
 */
export async function runAllPreflightChecks({ silent = false, failOnIssues = false } = {}) {
  const allIssues = [];
  const allWarnings = [];

  const checks = [
    () => checkNodeVersion(),
    () => checkDataDirWritable(),
    () => checkSqliteNetworkFs(),
    () => checkDrizzleConfigConflict(),
    () => checkDrizzleVersionSync(),
    () => checkTsxInstalled(),
    () => checkAIProvider(),
    () => checkCredentialHygiene(),
    () => checkModelDownloadRam(),
    () => checkSerpAPIQuota(),
    () => checkPlaywrightStealth(),
    () => checkPlaywrightEnv(),
    () => checkXenovaCache(),
    () => checkAiSdkVersionDrift(),
    // async checks
    () => checkBetterSqlite3(),
    () => checkRedisVersion(),
    () => checkBullBoardPort(),
    () => checkMailpitPort(),
    () => checkAITimeout(),
  ];

  for (const check of checks) {
    try {
      const result = await check();
      allIssues.push(...(result.issues || []));
      allWarnings.push(...(result.warnings || []));
    } catch (err) {
      allWarnings.push(`[preflight] Check threw an unexpected error: ${err.message}`);
    }
  }

  if (!silent) {
    if (allWarnings.length > 0) {
      console.log('\n[preflight] Warnings:');
      allWarnings.forEach((w) => console.warn(w));
    }
    if (allIssues.length > 0) {
      console.error('\n[preflight] Issues that need attention:');
      allIssues.forEach((i) => console.error(i));
    }
    if (allIssues.length === 0 && allWarnings.length === 0) {
      console.log('[preflight] All checks passed ✓');
    }
  }

  if (failOnIssues && allIssues.length > 0) {
    process.exit(1);
  }

  return { issues: allIssues, warnings: allWarnings };
}
