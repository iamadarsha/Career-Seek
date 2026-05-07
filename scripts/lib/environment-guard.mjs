/**
 * environment-guard.mjs
 * ─────────────────────
 * Single source of truth for EVERY known environment failure mode.
 *
 * 28 failure categories, each with:
 *   - detect()  : returns { triggered: bool, detail: string }
 *   - severity  : 'fatal' | 'error' | 'warn'
 *   - fix       : human-readable recovery steps (platform-aware)
 *
 * Usage:
 *   import { runEnvironmentGuard } from './lib/environment-guard.mjs';
 *   const { fatal, errors, warnings } = await runEnvironmentGuard();
 *   if (fatal.length) process.exit(1);
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync, execFileSync } from 'child_process';
import { createServer } from 'net';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const root = path.resolve(__dirname, '..', '..');
export const isWindows = process.platform === 'win32';
export const isMac    = process.platform === 'darwin';
export const isLinux  = process.platform === 'linux';

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  red: '\x1b[31m', green: '\x1b[32m',
  yellow: '\x1b[33m', cyan: '\x1b[36m',
};
const useColor = Boolean(process.stdout.isTTY);
const c = (code, s) => useColor ? `${code}${s}${C.reset}` : s;
export const info  = (m) => console.log(c(C.cyan,   `[guard] ${m}`));
export const ok    = (m) => console.log(c(C.green,  `[guard] ✓ ${m}`));
export const warn  = (m) => console.warn(c(C.yellow, `[guard] ⚠ ${m}`));
export const fail  = (m) => console.error(c(C.red,   `[guard] ✗ ${m}`));

// ─── helpers ───────────────────────────────────────────────────────────────
async function fetchHead(url, timeoutMs = 5000) {
  try {
    const r = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(timeoutMs) });
    return r.status < 500;
  } catch { return false; }
}

function freePortCheck(port) {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.listen(port, '127.0.0.1', () => srv.close(() => resolve(true)));
    srv.on('error', () => resolve(false));
  });
}

function spawnCheck(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'pipe', encoding: 'utf8', timeout: 5000 });
  return { ok: r.status === 0, stdout: (r.stdout || '').trim(), stderr: (r.stderr || '').trim() };
}

function readEnvLocal() {
  const p = path.join(root, '.env.local');
  if (!fs.existsSync(p)) return {};
  const out = {};
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 1) continue;
    out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return out;
}

// ─── guard definitions ──────────────────────────────────────────────────────
export const guards = [

  // ── 1. Node version ──────────────────────────────────────────────────────
  {
    id: 'node-version',
    severity: 'fatal',
    description: 'Node.js version outside supported range (>=20 <26)',
    async detect() {
      const major = Number(process.versions.node.split('.')[0]);
      if (major < 20 || major >= 26) {
        return { triggered: true, detail: `Running Node.js ${process.version}` };
      }
      return { triggered: false, detail: `Node.js ${process.version}` };
    },
    fix: 'Install Node.js 22 LTS: https://nodejs.org\n  macOS: brew install node@22\n  Windows: winget install OpenJS.NodeJS.LTS',
  },

  // ── 2. npm version ───────────────────────────────────────────────────────
  {
    id: 'npm-version',
    severity: 'warn',
    description: 'npm version < 8 (may not support workspaces or lockfile v3)',
    async detect() {
      const r = spawnCheck(isWindows ? 'npm.cmd' : 'npm', ['--version']);
      const major = parseInt(r.stdout, 10);
      if (!r.ok || major < 8) return { triggered: true, detail: `npm ${r.stdout || 'unknown'}` };
      return { triggered: false, detail: `npm ${r.stdout}` };
    },
    fix: 'Run: npm install -g npm@latest',
  },

  // ── 3. Disk space ─────────────────────────────────────────────────────────
  {
    id: 'disk-space',
    severity: 'warn',
    description: 'Less than 3 GB free disk space',
    async detect() {
      try {
        let freeBytes = 0;
        if (isWindows) {
          const r = spawnSync('powershell.exe',
            ['-NoProfile', '-Command', `(Get-PSDrive -Name ${root[0]}).Free`],
            { encoding: 'utf8', stdio: 'pipe', timeout: 5000 });
          freeBytes = Number((r.stdout || '').trim()) || 0;
        } else {
          const r = spawnCheck('df', ['-k', root]);
          freeBytes = Number((r.stdout.split('\n')[1] || '').trim().split(/\s+/)[3] || 0) * 1024;
        }
        const freeGb = freeBytes / 1024 ** 3;
        if (freeGb < 3) return { triggered: true, detail: `${freeGb.toFixed(1)} GB free` };
        return { triggered: false, detail: `${freeGb.toFixed(1)} GB free` };
      } catch (e) {
        return { triggered: false, detail: `check failed: ${e.message}` };
      }
    },
    fix: 'Free up disk space. Career Seek needs ~3 GB for dependencies, binaries, and the local database.',
  },

  // ── 4. RAM ────────────────────────────────────────────────────────────────
  {
    id: 'low-ram',
    severity: 'warn',
    description: 'Less than 2 GB free RAM (next build + Redis + Meilisearch may OOM)',
    async detect() {
      const freeMb = os.freemem() / 1024 ** 2;
      if (freeMb < 2048) return { triggered: true, detail: `${freeMb.toFixed(0)} MB free` };
      return { triggered: false, detail: `${(freeMb / 1024).toFixed(1)} GB free` };
    },
    fix: 'Close other applications. On low-RAM machines, set CAREER_SEEK_ENABLE_MEILI=0 and CAREER_SEEK_ENABLE_QDRANT=0 to disable heavy services.',
  },

  // ── 5. GitHub reachable ──────────────────────────────────────────────────
  {
    id: 'github-reachable',
    severity: 'warn',
    description: 'GitHub is not reachable (binary downloads will fail)',
    async detect() {
      const ok = await fetchHead('https://github.com');
      return { triggered: !ok, detail: ok ? 'reachable' : 'unreachable' };
    },
    fix: 'Check your internet connection.\n  Corporate proxy? Set:\n    export HTTPS_PROXY=http://proxy:8080\n    git config --global http.proxy http://proxy:8080',
  },

  // ── 6. npm registry reachable ────────────────────────────────────────────
  {
    id: 'npm-registry',
    severity: 'warn',
    description: 'npm registry is not reachable (npm install will fail)',
    async detect() {
      const ok = await fetchHead('https://registry.npmjs.org');
      return { triggered: !ok, detail: ok ? 'reachable' : 'unreachable' };
    },
    fix: 'Check your internet connection.\n  Restricted network? Try: npm config set registry https://registry.npmmirror.com\n  Proxy: npm config set proxy http://proxy:8080',
  },

  // ── 7. node_modules integrity ─────────────────────────────────────────────
  {
    id: 'node-modules',
    severity: 'error',
    description: 'node_modules is missing or broken (next binary absent)',
    async detect() {
      const nextBin = path.join(root, 'node_modules', '.bin', isWindows ? 'next.cmd' : 'next');
      const nextPkg = path.join(root, 'node_modules', 'next', 'package.json');
      if (!fs.existsSync(nextBin) || !fs.existsSync(nextPkg)) {
        return { triggered: true, detail: 'node_modules/.bin/next missing' };
      }
      return { triggered: false, detail: 'ok' };
    },
    fix: 'Run: npm install\n  If that fails: rm -rf node_modules package-lock.json && npm install',
  },

  // ── 8. better-sqlite3 native addon ───────────────────────────────────────
  {
    id: 'better-sqlite3',
    severity: 'error',
    description: 'better-sqlite3 native addon fails to load',
    async detect() {
      try {
        const mod = await import('better-sqlite3');
        // Smoke-test: open an in-memory DB
        const db = mod.default(':memory:');
        db.prepare('SELECT 1').get();
        db.close();
        return { triggered: false, detail: 'native addon ok' };
      } catch (e) {
        return { triggered: true, detail: e.message };
      }
    },
    fix: isMac
      ? 'Run: npm rebuild better-sqlite3\n  If that fails: xcode-select --install && npm rebuild better-sqlite3'
      : isWindows
        ? 'Run: npm rebuild better-sqlite3\n  If that fails install Visual C++ Build Tools:\n  https://aka.ms/vs/17/release/vs_BuildTools.exe'
        : 'Run: npm rebuild better-sqlite3\n  If that fails: sudo apt-get install -y build-essential python3 && npm rebuild better-sqlite3',
  },

  // ── 9. .env.local exists ─────────────────────────────────────────────────
  {
    id: 'env-local',
    severity: 'error',
    description: '.env.local missing (app will start without REDIS_URL)',
    async detect() {
      const p = path.join(root, '.env.local');
      if (!fs.existsSync(p)) return { triggered: true, detail: 'file missing' };
      const env = readEnvLocal();
      if (!env.REDIS_URL) return { triggered: true, detail: 'REDIS_URL not set' };
      return { triggered: false, detail: 'ok' };
    },
    fix: 'Run: npm run bootstrap\n  Or manually create .env.local with: REDIS_URL=redis://127.0.0.1:6379',
  },

  // ── 10. data dir writable ────────────────────────────────────────────────
  {
    id: 'data-dir-writable',
    severity: 'fatal',
    description: 'Data directory (~/.jobhunt-india) is not writable',
    async detect() {
      const dir = process.env.JOBHUNT_DATA_DIR || path.join(os.homedir(), '.jobhunt-india');
      try {
        fs.mkdirSync(dir, { recursive: true });
        const probe = path.join(dir, `.probe-${Date.now()}`);
        fs.writeFileSync(probe, 'x');
        fs.unlinkSync(probe);
        return { triggered: false, detail: dir };
      } catch (e) {
        return { triggered: true, detail: `${dir}: ${e.message}` };
      }
    },
    fix: 'Fix directory permissions or set JOBHUNT_DATA_DIR=/writable/path in .env.local',
  },

  // ── 11. Port 3000 free ───────────────────────────────────────────────────
  {
    id: 'port-3000',
    severity: 'warn',
    description: 'Port 3000 is already in use (app will auto-select next free port)',
    async detect() {
      const port = Number(process.env.CAREER_SEEK_PORT || 3000);
      const free = await freePortCheck(port);
      return { triggered: !free, detail: free ? 'free' : `port ${port} busy` };
    },
    fix: 'Career Seek auto-selects the next free port. To force a port:\n  Set CAREER_SEEK_PORT=3001 in .env.local',
  },

  // ── 12. Redis port free / Redis binary present ───────────────────────────
  {
    id: 'redis-binary',
    severity: 'error',
    description: 'Redis binary not found in binaries/manifest.json',
    async detect() {
      const manifestPath = path.join(root, 'binaries', 'manifest.json');
      if (!fs.existsSync(manifestPath)) return { triggered: true, detail: 'binaries/manifest.json missing' };
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const redis = manifest.services?.redis;
      if (!redis?.executablePath || !fs.existsSync(redis.executablePath)) {
        return { triggered: true, detail: 'redis executable missing from manifest' };
      }
      return { triggered: false, detail: `redis at ${redis.executablePath}` };
    },
    fix: 'Run: npm run bootstrap -- --repair\n  This will re-download the Redis portable binary.',
  },

  // ── 13. Redis version >= 6.2 (BullMQ streams) ────────────────────────────
  {
    id: 'redis-version',
    severity: 'warn',
    description: 'Redis < 6.2 does not support XAUTOCLAIM (BullMQ streams will fail)',
    async detect() {
      try {
        const manifestPath = path.join(root, 'binaries', 'manifest.json');
        if (!fs.existsSync(manifestPath)) return { triggered: false, detail: 'manifest absent' };
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const ver = manifest.services?.redis?.version || '';
        const [major, minor] = ver.replace(/^v/, '').split('.').map(Number);
        if (major < 6 || (major === 6 && (minor || 0) < 2)) {
          return { triggered: true, detail: `Redis ${ver}` };
        }
        return { triggered: false, detail: `Redis ${ver}` };
      } catch (e) {
        return { triggered: false, detail: `check skipped: ${e.message}` };
      }
    },
    fix: 'Run: npm run bootstrap -- --repair to update the embedded Redis binary to 7.x',
  },

  // ── 14. Playwright Chromium installed ────────────────────────────────────
  {
    id: 'playwright-chromium',
    severity: 'warn',
    description: 'Playwright Chromium not installed (job scraping will fail)',
    async detect() {
      try {
        const { chromium } = await import('playwright');
        const browser = await chromium.launch({ headless: true });
        await browser.close();
        return { triggered: false, detail: 'Chromium ok' };
      } catch (e) {
        return { triggered: true, detail: e.message };
      }
    },
    fix: 'Run: npx playwright install chromium\n  To skip: set CAREER_SEEK_SKIP_BROWSER_INSTALL=1 in .env.local',
  },

  // ── 15. Python venv present ──────────────────────────────────────────────
  {
    id: 'python-venv',
    severity: 'warn',
    description: 'Python venv (.venv-career-seek) missing — python-jobspy scraping unavailable',
    async detect() {
      const venvPip = isWindows
        ? path.join(root, '.venv-career-seek', 'Scripts', 'pip.exe')
        : path.join(root, '.venv-career-seek', 'bin', 'pip');
      if (!fs.existsSync(venvPip)) {
        return { triggered: true, detail: 'venv pip not found' };
      }
      return { triggered: false, detail: 'venv ok' };
    },
    fix: 'Run: npm run bootstrap\n  To skip: set CAREER_SEEK_SKIP_PYTHON_SETUP=1 in .env.local',
  },

  // ── 16. Windows long path support ────────────────────────────────────────
  {
    id: 'windows-long-paths',
    severity: isWindows ? 'error' : 'warn',
    description: 'Windows long path support is disabled (node_modules paths > 260 chars will fail)',
    async detect() {
      if (!isWindows) return { triggered: false, detail: 'not Windows' };
      try {
        const r = spawnSync('powershell.exe', [
          '-NoProfile', '-Command',
          '(Get-ItemProperty HKLM:\\SYSTEM\\CurrentControlSet\\Control\\FileSystem -Name LongPathsEnabled -ErrorAction SilentlyContinue).LongPathsEnabled',
        ], { encoding: 'utf8', stdio: 'pipe', timeout: 5000 });
        const val = (r.stdout || '').trim();
        if (val !== '1') return { triggered: true, detail: `LongPathsEnabled=${val || 'not set'}` };
        return { triggered: false, detail: 'LongPathsEnabled=1' };
      } catch { return { triggered: false, detail: 'registry check failed' }; }
    },
    fix: 'Run in Admin PowerShell:\n  Set-ItemProperty HKLM:\\SYSTEM\\CurrentControlSet\\Control\\FileSystem -Name LongPathsEnabled -Value 1\n  Then: git config --global core.longpaths true\n  And restart your terminal.',
  },

  // ── 17. Windows Git line endings (CRLF in .sh scripts will break bash) ───
  {
    id: 'git-crlf',
    severity: isWindows ? 'warn' : 'skip',
    description: 'git autocrlf is true — shell scripts may get CRLF line endings and fail on WSL/Mac',
    async detect() {
      if (!isWindows) return { triggered: false, detail: 'not Windows' };
      const r = spawnCheck(isWindows ? 'git.exe' : 'git', ['config', '--global', 'core.autocrlf']);
      if (r.stdout === 'true') return { triggered: true, detail: 'autocrlf=true' };
      return { triggered: false, detail: `autocrlf=${r.stdout || 'unset'}` };
    },
    fix: 'Run: git config --global core.autocrlf input',
  },

  // ── 18. macOS Gatekeeper quarantine on binaries ──────────────────────────
  {
    id: 'gatekeeper-quarantine',
    severity: isMac ? 'warn' : 'skip',
    description: 'Downloaded binaries still have macOS quarantine flag (xattr)',
    async detect() {
      if (!isMac) return { triggered: false, detail: 'not macOS' };
      const manifestPath = path.join(root, 'binaries', 'manifest.json');
      if (!fs.existsSync(manifestPath)) return { triggered: false, detail: 'no binaries yet' };
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const quarantined = [];
      for (const svc of Object.values(manifest.services || {})) {
        const bin = svc.executablePath;
        if (!bin || !fs.existsSync(bin)) continue;
        const r = spawnSync('xattr', ['-l', bin], { encoding: 'utf8', stdio: 'pipe' });
        if ((r.stdout || '').includes('com.apple.quarantine')) quarantined.push(bin);
      }
      if (quarantined.length > 0) return { triggered: true, detail: quarantined.join(', ') };
      return { triggered: false, detail: 'no quarantined binaries' };
    },
    fix: 'Run: npm run bootstrap -- --repair\n  Or manually: xattr -rd com.apple.quarantine ./binaries',
  },

  // ── 19. Antivirus / security scan stalling npm install (Windows) ─────────
  {
    id: 'antivirus-delay',
    severity: isWindows ? 'warn' : 'skip',
    description: 'Windows Defender real-time scan may slow npm install by 5-10×',
    async detect() {
      if (!isWindows) return { triggered: false, detail: 'not Windows' };
      try {
        const r = spawnSync('powershell.exe', [
          '-NoProfile', '-Command',
          '(Get-MpPreference -ErrorAction SilentlyContinue).DisableRealtimeMonitoring',
        ], { encoding: 'utf8', stdio: 'pipe', timeout: 6000 });
        const disabled = (r.stdout || '').trim() === 'True';
        return {
          triggered: !disabled,
          detail: disabled ? 'Real-time scan disabled' : 'Real-time scan enabled',
        };
      } catch { return { triggered: false, detail: 'check skipped' }; }
    },
    fix: 'Add the Career Seek folder to Windows Defender exclusions:\n  Settings → Windows Security → Virus & threat protection → Manage settings → Add an exclusion\n  Add folder: ' + root,
  },

  // ── 20. Symlink privileges (Windows — npm needs to create symlinks in node_modules) ─
  {
    id: 'windows-symlinks',
    severity: isWindows ? 'warn' : 'skip',
    description: 'Windows symlink creation may require Developer Mode or Admin rights',
    async detect() {
      if (!isWindows) return { triggered: false, detail: 'not Windows' };
      const probe = path.join(os.tmpdir(), `cs-symlink-probe-${Date.now()}`);
      const target = path.join(os.tmpdir(), `cs-symlink-target-${Date.now()}`);
      try {
        fs.writeFileSync(target, '');
        fs.symlinkSync(target, probe);
        fs.unlinkSync(probe);
        fs.unlinkSync(target);
        return { triggered: false, detail: 'symlinks ok' };
      } catch {
        try { fs.unlinkSync(probe); } catch { }
        try { fs.unlinkSync(target); } catch { }
        return { triggered: true, detail: 'symlink creation failed' };
      }
    },
    fix: 'Enable Developer Mode: Settings → Update & Security → For Developers → Developer Mode\n  Or run the installer as Administrator.',
  },

  // ── 21. SQLite on network drive ──────────────────────────────────────────
  {
    id: 'sqlite-network-drive',
    severity: 'error',
    description: 'SQLite data directory is on a network drive (NFS/SMB) — WAL mode will corrupt',
    async detect() {
      if (isWindows) return { triggered: false, detail: 'check not available on Windows' };
      const dir = process.env.JOBHUNT_DATA_DIR || path.join(os.homedir(), '.jobhunt-india');
      try {
        const r = spawnSync('stat', ['-f', '-c', '%T', dir], { encoding: 'utf8', stdio: 'pipe' });
        const fsType = (r.stdout || '').trim().toLowerCase();
        const networkFs = ['nfs', 'cifs', 'smb', 'smbfs', 'afpfs', 'fuse'].some((t) => fsType.includes(t));
        if (networkFs) return { triggered: true, detail: `fs type: ${fsType}` };
        return { triggered: false, detail: `fs type: ${fsType || 'local'}` };
      } catch { return { triggered: false, detail: 'stat check skipped' }; }
    },
    fix: 'Move the data directory to a local drive:\n  Set JOBHUNT_DATA_DIR=/local/path/to/career-seek-data in .env.local',
  },

  // ── 22. drizzle.config dual file ────────────────────────────────────────
  {
    id: 'drizzle-config-conflict',
    severity: 'warn',
    description: 'Both drizzle.config.js and drizzle.config.ts exist (drizzle-kit will use wrong one)',
    async detect() {
      const js = fs.existsSync(path.join(root, 'drizzle.config.js'));
      const ts = fs.existsSync(path.join(root, 'drizzle.config.ts'));
      if (js && ts) return { triggered: true, detail: 'both drizzle.config.js and .ts present' };
      return { triggered: false, detail: js ? 'drizzle.config.js' : ts ? 'drizzle.config.ts' : 'no drizzle config' };
    },
    fix: 'Delete drizzle.config.js — the TypeScript version is preferred:\n  rm drizzle.config.js',
  },

  // ── 23. @ai-sdk/* version drift ─────────────────────────────────────────
  {
    id: 'ai-sdk-drift',
    severity: 'warn',
    description: '@ai-sdk/* packages have mismatched major versions',
    async detect() {
      try {
        const pkgPath = path.join(root, 'package.json');
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        const all = { ...pkg.dependencies, ...pkg.devDependencies };
        const aiSdkPkgs = Object.entries(all).filter(([k]) => k.startsWith('@ai-sdk/'));
        const majors = [...new Set(aiSdkPkgs.map(([, v]) => parseInt(v.replace(/^[^\d]*/, ''), 10)))];
        if (majors.length > 1) {
          return { triggered: true, detail: aiSdkPkgs.map(([k, v]) => `${k}@${v}`).join(', ') };
        }
        return { triggered: false, detail: `all @ai-sdk/* at major ${majors[0] ?? 'unknown'}` };
      } catch (e) { return { triggered: false, detail: `check failed: ${e.message}` }; }
    },
    fix: 'Align all @ai-sdk/* packages to the same major version in package.json, then run npm install.',
  },

  // ── 24. Bull Board port conflict ─────────────────────────────────────────
  {
    id: 'bull-board-port',
    severity: 'warn',
    description: 'Bull Board port (3002) is already in use',
    async detect() {
      const port = Number(process.env.BULL_BOARD_PORT || 3002);
      const free = await freePortCheck(port);
      return { triggered: !free, detail: free ? 'free' : `port ${port} busy` };
    },
    fix: 'Set BULL_BOARD_PORT=3003 (or any free port) in .env.local',
  },

  // ── 25. Mailpit SMTP port conflict ───────────────────────────────────────
  {
    id: 'mailpit-port',
    severity: 'warn',
    description: 'Mailpit SMTP port 1025 is in use',
    async detect() {
      const free = await freePortCheck(1025);
      return { triggered: !free, detail: free ? 'free' : 'port 1025 busy' };
    },
    fix: 'Kill the process using port 1025, or set SMTP_PORT to another port in .env.local',
  },

  // ── 26. CI environment + job-site credentials ────────────────────────────
  {
    id: 'ci-credentials-leak',
    severity: 'error',
    description: 'Job-site credentials present in CI environment (credential leak risk)',
    async detect() {
      const ci = process.env.CI || process.env.GITHUB_ACTIONS || process.env.CIRCLECI || process.env.JENKINS_URL;
      if (!ci) return { triggered: false, detail: 'not in CI' };
      const credKeys = ['LINKEDIN_EMAIL', 'LINKEDIN_PASSWORD', 'NAUKRI_EMAIL', 'NAUKRI_PASSWORD', 'INDEED_EMAIL', 'INDEED_PASSWORD'];
      const found = credKeys.filter((k) => process.env[k]);
      if (found.length > 0) return { triggered: true, detail: `CI env has: ${found.join(', ')}` };
      return { triggered: false, detail: 'no credentials in CI' };
    },
    fix: 'Remove job-site credentials from CI environment variables. These are for local use only.',
  },

  // ── 27. tsx binary present ───────────────────────────────────────────────
  {
    id: 'tsx-binary',
    severity: 'warn',
    description: 'tsx not installed locally — worker scripts will use slow npx cold-start',
    async detect() {
      const tsxBin = path.join(root, 'node_modules', '.bin', isWindows ? 'tsx.cmd' : 'tsx');
      if (!fs.existsSync(tsxBin)) return { triggered: true, detail: 'tsx not in node_modules/.bin' };
      return { triggered: false, detail: 'tsx ok' };
    },
    fix: 'Run: npm install (tsx is already in devDependencies; it should be installed)',
  },

  // ── 28. Stale .next build (code changed but BUILD_ID unchanged) ──────────
  {
    id: 'stale-build',
    severity: 'warn',
    description: '.next/BUILD_ID exists but is older than source files by > 24h',
    async detect() {
      const buildIdPath = path.join(root, '.next', 'BUILD_ID');
      if (!fs.existsSync(buildIdPath)) return { triggered: false, detail: 'no build yet' };
      const buildTime = fs.statSync(buildIdPath).mtimeMs;
      const srcDir = path.join(root, 'app');
      if (!fs.existsSync(srcDir)) return { triggered: false, detail: 'no app dir' };
      let newestSrc = 0;
      (function walk(dir) {
        try {
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory() && entry.name !== 'node_modules') walk(full);
            else if (entry.isFile()) newestSrc = Math.max(newestSrc, fs.statSync(full).mtimeMs);
          }
        } catch { }
      })(srcDir);
      const staleMsByDay = 24 * 60 * 60 * 1000;
      if (newestSrc > buildTime + staleMsByDay) {
        return { triggered: true, detail: `build is ${Math.round((newestSrc - buildTime) / staleMsByDay)}d behind source` };
      }
      return { triggered: false, detail: 'build is fresh' };
    },
    fix: 'Run: npm run build\n  Or: npm run launch (it auto-builds if BUILD_ID is missing)',
  },
];

// ─── runner ─────────────────────────────────────────────────────────────────
/**
 * Run all guards (or a filtered subset) and return categorised results.
 * @param {{ ids?: string[], silent?: boolean }} opts
 * @returns {Promise<{ fatal: GuardResult[], errors: GuardResult[], warnings: GuardResult[], passed: GuardResult[] }>}
 */
export async function runEnvironmentGuard({ ids, silent = false } = {}) {
  const active = ids ? guards.filter((g) => ids.includes(g.id)) : guards.filter((g) => g.severity !== 'skip');
  const fatal = [], errors = [], warnings = [], passed = [];

  for (const guard of active) {
    let result;
    try {
      result = await guard.detect();
    } catch (e) {
      result = { triggered: false, detail: `guard threw: ${e.message}` };
    }

    const item = { id: guard.id, description: guard.description, detail: result.detail, fix: guard.fix, severity: guard.severity };

    if (!result.triggered) {
      passed.push(item);
      if (!silent) ok(`${guard.description} — ${result.detail}`);
    } else {
      if (guard.severity === 'fatal') { fatal.push(item); if (!silent) fail(`FATAL: ${guard.description}\n  ${result.detail}\n  Fix: ${guard.fix}`); }
      else if (guard.severity === 'error') { errors.push(item); if (!silent) fail(`ERROR: ${guard.description}\n  ${result.detail}\n  Fix: ${guard.fix}`); }
      else { warnings.push(item); if (!silent) warn(`${guard.description}\n  ${result.detail}\n  Fix: ${guard.fix}`); }
    }
  }

  if (!silent) {
    console.log('');
    console.log(`Guard summary: ${passed.length} passed, ${errors.length} errors, ${warnings.length} warnings, ${fatal.length} fatal`);
  }

  return { fatal, errors, warnings, passed };
}

/**
 * Run guards and exit with code 1 if any fatal/error issues found.
 * Designed to be called as a standalone script: node scripts/lib/environment-guard.mjs
 */
export async function runGuardAndExit() {
  console.log('\nCareer Seek — Environment Guard');
  console.log('================================');
  const { fatal, errors, warnings } = await runEnvironmentGuard({ silent: false });
  if (fatal.length || errors.length) {
    console.error(`\n${fatal.length + errors.length} blocking issue(s) found. Fix them before launching Career Seek.`);
    process.exit(1);
  }
  if (warnings.length) {
    console.warn(`\n${warnings.length} warning(s) — Career Seek will start but some features may be degraded.`);
  } else {
    console.log('\nAll environment checks passed. Career Seek is ready.');
  }
  process.exit(0);
}

// Allow running directly: node scripts/lib/environment-guard.mjs
if (import.meta.url === `file://${process.argv[1]}`) {
  runGuardAndExit().catch((e) => { console.error(e); process.exit(1); });
}
