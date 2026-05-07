import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn, spawnSync } from 'child_process';
import { pipeline } from 'stream/promises';
import { fileURLToPath } from 'url';
import {
  commandExists,
  isWindows,
  npmCmd,
} from './runtime.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const binariesDir = path.join(root, 'binaries');
const manifestPath = path.join(binariesDir, 'manifest.json');
const userAgent = 'career-seek-local-runtime/1.0';

function serviceEnabled(name, defaultValue) {
  const flag = process.env[`CAREER_SEEK_ENABLE_${name.toUpperCase()}`];
  if (flag === '0' || flag === 'false') return false;
  if (flag === '1' || flag === 'true') return true;
  return defaultValue;
}

export function nativeServiceSelection(args = process.argv.slice(2)) {
  const flags = new Set(args);
  return {
    redis: !flags.has('--without-redis') && serviceEnabled('redis', true),
    meilisearch: flags.has('--with-meili') || flags.has('--with-meilisearch') || serviceEnabled('meili', true),
    qdrant: flags.has('--with-qdrant') || serviceEnabled('qdrant', false),
  };
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readManifest() {
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return { schemaVersion: '1.0.0', installedAt: null, services: {} };
  }
}

function writeManifest(manifest) {
  ensureDir(binariesDir);
  fs.writeFileSync(manifestPath, JSON.stringify({
    ...manifest,
    updatedAt: new Date().toISOString(),
  }, null, 2));
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function parseDigest(digest) {
  if (!digest) return '';
  return String(digest).replace(/^sha256:/i, '').trim().toLowerCase();
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { 'user-agent': userAgent } });
  if (!response.ok) {
    throw new Error(`Could not fetch ${url}: HTTP ${response.status}`);
  }
  return response.json();
}

async function downloadFile(url, target, expectedSha256) {
  ensureDir(path.dirname(target));
  const response = await fetch(url, { headers: { 'user-agent': userAgent } });
  if (!response.ok || !response.body) {
    throw new Error(`Download failed for ${url}: HTTP ${response.status}`);
  }
  const tmp = `${target}.download`;
  await pipeline(response.body, fs.createWriteStream(tmp));
  const actual = sha256File(tmp);
  if (expectedSha256 && actual !== expectedSha256.toLowerCase()) {
    fs.rmSync(tmp, { force: true });
    throw new Error(`Checksum mismatch for ${path.basename(target)}. Expected ${expectedSha256}, got ${actual}.`);
  }
  fs.renameSync(tmp, target);
  return actual;
}

function platformKey() {
  if (process.platform === 'darwin') return process.arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64';
  if (process.platform === 'linux') return process.arch === 'arm64' ? 'linux-arm64' : 'linux-x64';
  if (process.platform === 'win32') return 'windows-x64';
  return `${process.platform}-${process.arch}`;
}

function condaSubdir() {
  if (process.platform === 'darwin') return process.arch === 'arm64' ? 'osx-arm64' : 'osx-64';
  if (process.platform === 'linux') return process.arch === 'arm64' ? 'linux-aarch64' : 'linux-64';
  if (process.platform === 'win32') return 'win-64';
  throw new Error(`Redis portable binary is not configured for ${process.platform}/${process.arch}.`);
}

function githubAssetName(service) {
  const key = platformKey();
  if (service === 'meilisearch') {
    return {
      'darwin-arm64': 'meilisearch-macos-apple-silicon',
      'darwin-x64': 'meilisearch-macos-amd64',
      'linux-arm64': 'meilisearch-linux-aarch64',
      'linux-x64': 'meilisearch-linux-amd64',
      'windows-x64': 'meilisearch-windows-amd64.exe',
    }[key];
  }
  if (service === 'qdrant') {
    return {
      'darwin-arm64': 'qdrant-aarch64-apple-darwin.tar.gz',
      'darwin-x64': 'qdrant-x86_64-apple-darwin.tar.gz',
      'linux-arm64': 'qdrant-aarch64-unknown-linux-musl.tar.gz',
      'linux-x64': 'qdrant-x86_64-unknown-linux-gnu.tar.gz',
      'windows-x64': 'qdrant-x86_64-pc-windows-msvc.zip',
    }[key];
  }
  return undefined;
}

function executableName(name) {
  return isWindows ? `${name}.exe` : name;
}

function runExtraction(command, args, message) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`${message} failed with exit code ${result.status ?? 'unknown'}.`);
  }
}

function extractArchive(archivePath, targetDir) {
  ensureDir(targetDir);
  if (archivePath.endsWith('.zip')) {
    if (commandExists('unzip')) {
      runExtraction('unzip', ['-o', archivePath, '-d', targetDir], 'zip extraction');
      return;
    }
    runExtraction('tar', ['-xf', archivePath, '-C', targetDir], 'zip extraction');
    return;
  }
  if (archivePath.endsWith('.tar.gz') || archivePath.endsWith('.tgz')) {
    runExtraction('tar', ['-xzf', archivePath, '-C', targetDir], 'tar extraction');
  }
}

async function latestGithubAsset(repo, wantedName) {
  const release = await fetchJson(`https://api.github.com/repos/${repo}/releases/latest`);
  const asset = release.assets?.find((candidate) => candidate.name === wantedName);
  if (!asset) {
    throw new Error(`No ${wantedName} asset found in latest ${repo} release.`);
  }
  return {
    version: release.tag_name,
    name: asset.name,
    url: asset.browser_download_url,
    sha256: parseDigest(asset.digest),
  };
}

function findFile(dir, filename) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = findFile(fullPath, filename);
      if (nested) return nested;
    } else if (entry.name === filename) {
      return fullPath;
    }
  }
  return '';
}

async function installGithubBinary({ service, repo, executable }) {
  const wantedName = githubAssetName(service);
  if (!wantedName) throw new Error(`${service} binary is not available for ${platformKey()}.`);
  const asset = await latestGithubAsset(repo, wantedName);
  const serviceDir = path.join(binariesDir, service);
  const downloadPath = path.join(serviceDir, 'downloads', asset.name);
  const executablePath = path.join(serviceDir, executableName(executable));
  const manifest = readManifest();
  const existing = manifest.services?.[service];

  if (existing?.sha256 && fs.existsSync(executablePath) && fs.existsSync(downloadPath)) {
    const actual = sha256File(downloadPath);
    if (actual === existing.sha256) {
      return existing;
    }
  }

  console.log(`[native] Downloading ${service} ${asset.version}...`);
  const sha256 = await downloadFile(downloadPath ? asset.url : asset.url, downloadPath, asset.sha256);
  fs.rmSync(path.join(serviceDir, 'extract'), { recursive: true, force: true });
  const extractDir = path.join(serviceDir, 'extract');
  ensureDir(extractDir);

  if (asset.name.endsWith('.tar.gz') || asset.name.endsWith('.zip')) {
    extractArchive(downloadPath, extractDir);
    const found = findFile(extractDir, executableName(executable)) || findFile(extractDir, executable);
    if (!found) throw new Error(`Downloaded ${service} archive did not contain ${executable}.`);
    fs.copyFileSync(found, executablePath);
  } else {
    fs.copyFileSync(downloadPath, executablePath);
  }

  if (!isWindows) {
    fs.chmodSync(executablePath, 0o755);
    // macOS Gatekeeper quarantines downloaded files and blocks execution.
    // Clear the quarantine attribute so the binary can run without a security dialog.
    if (process.platform === 'darwin') {
      try {
        spawnSync('xattr', ['-d', 'com.apple.quarantine', executablePath], { stdio: 'ignore' });
      } catch { /* xattr not available on Linux — ignore */ }
    }
  }

  const entry = {
    service,
    version: asset.version,
    source: repo,
    asset: asset.name,
    url: asset.url,
    sha256,
    executablePath,
    installedAt: new Date().toISOString(),
  };
  manifest.services = { ...(manifest.services || {}), [service]: entry };
  manifest.installedAt ||= entry.installedAt;
  writeManifest(manifest);
  return entry;
}

function condaPackageName(dep) {
  const name = String(dep || '').split(/\s+/)[0];
  if (!name || name.startsWith('__')) return '';
  return name;
}

async function latestCondaFile(packageName, subdir) {
  const metadata = await fetchJson(`https://api.anaconda.org/package/conda-forge/${packageName}`);
  const files = (metadata.files || [])
    .filter((file) => file.attrs?.subdir === subdir && file.basename?.endsWith('.conda'))
    .sort((left, right) => {
      const leftTime = Date.parse(left.upload_time || left.attrs?.timestamp || 0);
      const rightTime = Date.parse(right.upload_time || right.attrs?.timestamp || 0);
      return rightTime - leftTime;
    });
  const file = files[0];
  if (!file) throw new Error(`No conda-forge ${packageName} package found for ${subdir}.`);
  return {
    packageName,
    version: file.version,
    basename: file.basename,
    url: `https://conda.anaconda.org/conda-forge/${file.basename}`,
    sha256: file.sha256,
    depends: file.attrs?.depends || [],
  };
}

function extractCondaPackage(archivePath, targetDir) {
  const outer = `${archivePath}.outer`;
  fs.rmSync(outer, { recursive: true, force: true });
  ensureDir(outer);
  runExtraction('tar', ['-xf', archivePath, '-C', outer], 'conda package extraction');
  const pkg = fs.readdirSync(outer).find((name) => name.startsWith('pkg-') && name.endsWith('.tar.zst'));
  if (!pkg) throw new Error(`Conda package ${archivePath} did not contain pkg-*.tar.zst.`);
  if (!commandExists('zstd')) {
    throw new Error('zstd is required to unpack Redis portable packages. Install zstd, or run setup again after installing Homebrew zstd.');
  }
  const command = `zstd -dc ${JSON.stringify(path.join(outer, pkg))} | tar -xf - -C ${JSON.stringify(targetDir)}`;
  const result = spawnSync(isWindows ? 'cmd.exe' : 'sh', [isWindows ? '/c' : '-lc', command], { stdio: 'inherit' });
  fs.rmSync(outer, { recursive: true, force: true });
  if (result.status !== 0) {
    throw new Error(`Could not extract conda package ${path.basename(archivePath)}.`);
  }
}

async function installCondaPackage(packageName, prefixDir, installed = new Set()) {
  if (installed.has(packageName)) return [];
  installed.add(packageName);
  const subdir = condaSubdir();
  const file = await latestCondaFile(packageName, subdir);
  const downloadPath = path.join(prefixDir, 'downloads', path.basename(file.basename));
  console.log(`[native] Installing ${packageName} ${file.version} from conda-forge...`);
  await downloadFile(file.url, downloadPath, file.sha256);
  extractCondaPackage(downloadPath, prefixDir);

  const installedEntries = [{
    packageName,
    version: file.version,
    url: file.url,
    sha256: file.sha256,
    depends: file.depends,
  }];

  for (const dep of file.depends.map(condaPackageName).filter(Boolean)) {
    if (dep === packageName || dep === 'python') continue;
    if (['libgcc-ng', 'libstdcxx-ng', 'libgomp', 'libzlib', 'zlib', 'xz', 'ncurses', 'readline'].includes(dep)) continue;
    installedEntries.push(...await installCondaPackage(dep, prefixDir, installed));
  }

  return installedEntries;
}

async function installRedis() {
  const service = 'redis';
  const serviceDir = path.join(binariesDir, service);
  const prefixDir = path.join(serviceDir, 'prefix');
  const executablePath = path.join(prefixDir, 'bin', executableName('redis-server'));
  const manifest = readManifest();
  const existing = manifest.services?.[service];
  if (existing?.executablePath && fs.existsSync(existing.executablePath)) {
    return existing;
  }

  // Try conda-forge first; fall back to system Redis if conda download fails.
  let packages = [];
  let resolvedExecutablePath = executablePath;
  let source = 'conda-forge/redis-server';

  try {
    fs.rmSync(prefixDir, { recursive: true, force: true });
    ensureDir(prefixDir);
    packages = await installCondaPackage('redis-server', prefixDir);
    if (!fs.existsSync(executablePath)) {
      throw new Error('Conda install finished but redis-server binary was not found.');
    }
  } catch (condaError) {
    console.warn(`[native] Conda Redis install failed (${condaError.message}). Trying system Redis...`);
    // Look for a system-installed redis-server (Homebrew, apt, choco, etc.)
    const systemRedis = isWindows
      ? spawnSync('where.exe', ['redis-server'], { encoding: 'utf8' }).stdout?.trim().split('\n')[0]?.trim()
      : spawnSync('sh', ['-lc', 'command -v redis-server'], { encoding: 'utf8' }).stdout?.trim();

    if (systemRedis && fs.existsSync(systemRedis)) {
      console.log(`[native] Using system Redis at ${systemRedis}`);
      resolvedExecutablePath = systemRedis;
      source = 'system';
    } else {
      console.warn('[native] No system Redis found. BullMQ queues will be unavailable until Redis is installed.');
      return null;
    }
  }

  if (!isWindows && resolvedExecutablePath !== executablePath) {
    // system binary — no chmod needed, already executable
  } else if (!isWindows) {
    fs.chmodSync(resolvedExecutablePath, 0o755);
    // Clear macOS Gatekeeper quarantine on conda-downloaded binary
    if (process.platform === 'darwin') {
      try { spawnSync('xattr', ['-d', 'com.apple.quarantine', resolvedExecutablePath], { stdio: 'ignore' }); } catch { }
    }
  }

  const redisPackage = packages.find((pkg) => pkg.packageName === 'redis-server');
  const entry = {
    service,
    version: redisPackage?.version || 'system',
    source,
    packages,
    executablePath: resolvedExecutablePath,
    installedAt: new Date().toISOString(),
  };
  manifest.services = { ...(manifest.services || {}), [service]: entry };
  manifest.installedAt ||= entry.installedAt;
  writeManifest(manifest);
  return entry;
}

export async function ensureNativeBinaries(selection = nativeServiceSelection()) {
  ensureDir(binariesDir);
  const installed = {};
  if (selection.redis) installed.redis = await installRedis();
  if (selection.meilisearch) {
    installed.meilisearch = await installGithubBinary({
      service: 'meilisearch',
      repo: 'meilisearch/meilisearch',
      executable: 'meilisearch',
    });
  }
  if (selection.qdrant) {
    installed.qdrant = await installGithubBinary({
      service: 'qdrant',
      repo: 'qdrant/qdrant',
      executable: 'qdrant',
    });
  }
  return installed;
}

export function getNativeManifest() {
  return readManifest();
}

function parseRedisUrl() {
  const raw = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  try {
    const url = new URL(raw);
    return {
      host: url.hostname || '127.0.0.1',
      port: Number(url.port || 6379),
      url: raw,
    };
  } catch {
    return { host: '127.0.0.1', port: 6379, url: 'redis://127.0.0.1:6379' };
  }
}

function meiliHost() {
  return process.env.MEILI_HOST || process.env.MEILISEARCH_URL || 'http://127.0.0.1:7700';
}

function qdrantHost() {
  return process.env.QDRANT_URL || process.env.JOBS_QDRANT_URL || 'http://127.0.0.1:6333';
}

async function waitForHealth(label, probe, timeoutMs = 15_000) {
  const started = Date.now();
  let lastError = '';
  while (Date.now() - started < timeoutMs) {
    try {
      const ok = await probe();
      if (ok) return true;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 450));
  }
  throw new Error(`${label} did not become ready within ${timeoutMs}ms${lastError ? `: ${lastError}` : ''}.`);
}

async function pingRedis(redisUrl) {
  const Redis = (await import('ioredis')).default;
  const client = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 1_000,
    retryStrategy: () => null,
  });
  client.on('error', () => undefined);
  try {
    await client.ping();
    return true;
  } finally {
    client.disconnect();
  }
}

async function pingHttp(url, pathName) {
  const response = await fetch(`${url.replace(/\/+$/, '')}${pathName}`, {
    signal: AbortSignal.timeout(1_500),
  });
  return response.ok;
}

export async function startNativeServices({ selection = nativeServiceSelection(), env = process.env, onChild } = {}) {
  const manifest = readManifest();
  const children = [];
  const childEnv = { ...env };

  function spawnService(label, bin, args, options = {}) {
    console.log(`[native] Starting ${label}: ${bin} ${args.join(' ')}`);
    const child = spawn(bin, args, {
      stdio: 'inherit',
      env: { ...childEnv, ...(options.env || {}) },
      cwd: root,
      shell: false,
    });
    children.push(child);
    onChild?.(child, label);
    return child;
  }

  if (selection.redis) {
    const redis = manifest.services?.redis;
    if (!redis?.executablePath || !fs.existsSync(redis.executablePath)) {
      throw new Error('Redis binary is missing. Run npm run setup first, or run npm run bootstrap -- --repair.');
    }
    const redisConfig = parseRedisUrl();
    const redisDir = path.join(binariesDir, 'redis', 'data');
    ensureDir(redisDir);
    spawnService('Redis', redis.executablePath, [
      '--bind', redisConfig.host,
      '--port', String(redisConfig.port),
      '--dir', redisDir,
      '--save', '',
      '--appendonly', 'no',
      '--protected-mode', 'no',
    ]);
    await waitForHealth('Redis', () => pingRedis(redisConfig.url));
    childEnv.REDIS_URL = redisConfig.url;
  }

  if (selection.meilisearch) {
    try {
      const meili = manifest.services?.meilisearch;
      if (!meili?.executablePath || !fs.existsSync(meili.executablePath)) {
        throw new Error('Meilisearch binary is missing. Run npm run setup first, or disable it with CAREER_SEEK_ENABLE_MEILI=0.');
      }
      const host = meiliHost();
      const url = new URL(host);
      const dbPath = path.join(binariesDir, 'meilisearch', 'data');
      ensureDir(dbPath);
      spawnService('Meilisearch', meili.executablePath, [
        '--http-addr', `${url.hostname || '127.0.0.1'}:${url.port || 7700}`,
        '--db-path', dbPath,
        '--env', 'development',
        '--no-analytics',
      ], {
        env: {
          MEILI_ENV: 'development',
          MEILI_MASTER_KEY: childEnv.MEILI_MASTER_KEY || childEnv.MEILI_API_KEY || '',
        },
      });
      await waitForHealth('Meilisearch', () => pingHttp(host, '/health'));
      childEnv.MEILI_HOST = host;
      childEnv.MEILISEARCH_URL = host;
    } catch (error) {
      console.warn(`[native] Meilisearch unavailable; search will use local fallback: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (selection.qdrant) {
    try {
      const qdrant = manifest.services?.qdrant;
      if (!qdrant?.executablePath || !fs.existsSync(qdrant.executablePath)) {
        throw new Error('Qdrant binary is missing. Run npm run setup -- --with-qdrant first, or disable it with CAREER_SEEK_ENABLE_QDRANT=0.');
      }
      const host = qdrantHost();
      const url = new URL(host);
      const storageDir = path.join(binariesDir, 'qdrant', 'storage');
      ensureDir(storageDir);
      spawnService('Qdrant', qdrant.executablePath, [], {
        env: {
          QDRANT__SERVICE__HOST: url.hostname || '127.0.0.1',
          QDRANT__SERVICE__HTTP_PORT: String(url.port || 6333),
          QDRANT__STORAGE__STORAGE_PATH: storageDir,
        },
      });
      await waitForHealth('Qdrant', () => pingHttp(host, '/healthz'), 20_000);
      childEnv.QDRANT_URL = host;
      childEnv.JOBS_QDRANT_URL = host;
    } catch (error) {
      console.warn(`[native] Qdrant unavailable; Dream Match will use in-memory fallback: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { children, env: childEnv };
}
