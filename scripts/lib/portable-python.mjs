import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { Readable } from 'stream';

const root = process.cwd();
const pythonDir = path.join(root, 'binaries', 'python');
const manifestPath = path.join(pythonDir, 'manifest.json');
const userAgent = 'career-seek-portable-python/1.0';

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function platformTarget() {
  if (process.platform === 'darwin') {
    return process.arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
  }
  if (process.platform === 'linux') {
    return process.arch === 'arm64' ? 'aarch64-unknown-linux-gnu' : 'x86_64-unknown-linux-gnu';
  }
  if (process.platform === 'win32') {
    return process.arch === 'arm64' ? 'aarch64-pc-windows-msvc' : 'x86_64-pc-windows-msvc';
  }
  throw new Error(`Portable Python is not configured for ${process.platform}/${process.arch}.`);
}

function portablePythonCurrentDir() {
  return path.join(pythonDir, 'current');
}

export function portablePythonCandidates() {
  const current = portablePythonCurrentDir();
  return process.platform === 'win32'
    ? [
        path.join(current, 'python', 'python.exe'),
        path.join(current, 'python', 'Lib', 'venv', 'scripts', 'nt', 'python.exe'),
      ]
    : [
        path.join(current, 'python', 'bin', 'python3'),
        path.join(current, 'python', 'bin', 'python'),
      ];
}

export function detectPortablePythonBin() {
  return portablePythonCandidates().find((candidate) => fs.existsSync(candidate)) || '';
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function readManifest() {
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return { service: 'python', installedAt: null };
  }
}

function writeManifest(manifest) {
  ensureDir(pythonDir);
  fs.writeFileSync(manifestPath, JSON.stringify({
    ...manifest,
    updatedAt: new Date().toISOString(),
  }, null, 2));
}

function run(command, args, message) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`${message} failed with exit code ${result.status ?? 'unknown'}.`);
  }
}

function extractArchive(archivePath, targetDir) {
  ensureDir(targetDir);
  run('tar', ['-xzf', archivePath, '-C', targetDir], 'Portable Python extraction');
}

function parseVersion(version) {
  const parts = String(version || '').trim().split('.').map((item) => Number(item));
  return { major: parts[0] || 0, minor: parts[1] || 0, patch: parts[2] || 0 };
}

export function inspectPythonBinary(candidate) {
  if (!candidate || !fs.existsSync(candidate)) return null;
  const version = spawnSync(candidate, ['-c', 'import sys; print(".".join(map(str, sys.version_info[:3])))'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (version.status !== 0) return null;
  const parsed = parseVersion(version.stdout.trim());
  return {
    path: candidate,
    version: version.stdout.trim(),
    compatibleJobSpy: parsed.major === 3 && parsed.minor >= 9 && parsed.minor <= 12,
  };
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
  const file = fs.createWriteStream(tmp);
  const body =
    typeof response.body.getReader === 'function'
      ? Readable.fromWeb(response.body)
      : response.body;
  await new Promise((resolve, reject) => {
    body.on('error', reject);
    file.on('error', reject);
    file.on('finish', resolve);
    body.pipe(file);
  });
  const actual = sha256File(tmp);
  if (expectedSha256 && actual !== expectedSha256.toLowerCase()) {
    fs.rmSync(tmp, { force: true });
    throw new Error(`Checksum mismatch for ${path.basename(target)}. Expected ${expectedSha256}, got ${actual}.`);
  }
  fs.renameSync(tmp, target);
  return actual;
}

async function latestPortablePythonAsset(versionPrefix = '3.12.') {
  const release = await fetchJson('https://api.github.com/repos/astral-sh/python-build-standalone/releases/latest');
  const target = platformTarget();
  const asset = (release.assets || []).find((candidate) => {
    const name = String(candidate.name || '');
    return name.startsWith(`cpython-${versionPrefix}`) && name.includes(target) && name.endsWith('install_only.tar.gz');
  });
  if (!asset) {
    throw new Error(`No Python ${versionPrefix} portable asset was found for ${target}.`);
  }
  return {
    version: release.tag_name,
    name: asset.name,
    url: asset.browser_download_url,
    sha256: String(asset.digest || '').replace(/^sha256:/i, '').toLowerCase(),
  };
}

export async function ensurePortablePython({ force = false, versionPrefix = '3.12.' } = {}) {
  const existing = inspectPythonBinary(detectPortablePythonBin());
  if (existing?.compatibleJobSpy && !force) {
    return {
      pythonBin: existing.path,
      version: existing.version,
      source: 'existing_portable',
    };
  }

  ensureDir(pythonDir);
  const asset = await latestPortablePythonAsset(versionPrefix);
  const archivePath = path.join(pythonDir, 'downloads', asset.name);
  const extractDir = portablePythonCurrentDir();
  const manifest = readManifest();

  const alreadyDownloaded = fs.existsSync(archivePath) && (!asset.sha256 || sha256File(archivePath) === asset.sha256);
  if (!alreadyDownloaded) {
    console.log(`[python] Downloading portable Python ${asset.name}...`);
    await downloadFile(asset.url, archivePath, asset.sha256);
  }

  fs.rmSync(extractDir, { recursive: true, force: true });
  ensureDir(extractDir);
  extractArchive(archivePath, extractDir);

  const pythonBin = detectPortablePythonBin();
  const details = inspectPythonBinary(pythonBin);
  if (!details) {
    throw new Error('Portable Python was extracted, but the interpreter was not found.');
  }

  writeManifest({
    service: 'python',
    asset: asset.name,
    version: asset.version,
    sha256: asset.sha256,
    pythonBin,
    installedAt: new Date().toISOString(),
    compatibleJobSpy: details.compatibleJobSpy,
  });

  return {
    pythonBin,
    version: details.version,
    source: 'downloaded_portable',
    manifest,
  };
}
