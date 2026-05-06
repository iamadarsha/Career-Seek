/**
 * ensure-redis.mjs
 *
 * Runs as `predev` and `prestart` npm hooks.
 *
 * 1. Pings Redis at REDIS_URL (default redis://127.0.0.1:6379).
 * 2. If already running  → exits 0 immediately (nothing to do).
 * 3. If not running      → finds the bundled redis-server binary from
 *                          binaries/manifest.json and starts it as a
 *                          detached background daemon.
 * 4. Waits up to 10 s for Redis to respond, then exits 0.
 * 5. If the binary is missing (fresh clone, setup not run yet) → warns
 *    and exits 0 so Next.js still starts; health panel will show the issue.
 *
 * The script is intentionally non-fatal: it never exits with code 1.
 * A missing or unreachable Redis just means background jobs are queued
 * until the user runs `npm run setup` or `npm run launch`.
 *
 * When called from `npm run launch` the parent process has already started
 * Redis and set REDIS_URL in the child environment, so the fast-path ping
 * succeeds and this script exits in < 200 ms.
 */

import fs   from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ── helpers ──────────────────────────────────────────────────────────── */

/** Load .env.local into process.env without overwriting existing values. */
function loadDotEnv() {
  const envPath = path.join(root, '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2];
    }
  }
}

function readManifest() {
  const manifestPath = path.join(root, 'binaries', 'manifest.json');
  try { return JSON.parse(fs.readFileSync(manifestPath, 'utf8')); }
  catch { return { services: {} }; }
}

function parseRedisUrl(url) {
  try {
    const parsed = new URL(url);
    return { host: parsed.hostname || '127.0.0.1', port: Number(parsed.port || 6379) };
  } catch {
    return { host: '127.0.0.1', port: 6379 };
  }
}

async function pingRedis(url) {
  let client;
  try {
    const { default: Redis } = await import('ioredis');
    client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      connectTimeout: 1_500,
      retryStrategy: () => null,
      enableOfflineQueue: false,
    });
    client.on('error', () => undefined);
    await client.connect();
    const pong = await client.ping();
    return pong === 'PONG';
  } catch {
    return false;
  } finally {
    client?.disconnect();
  }
}

async function waitForRedis(url, timeoutMs = 10_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await pingRedis(url)) return true;
    await new Promise((r) => setTimeout(r, 350));
  }
  return false;
}

/**
 * Safely upsert a key in .env.local without touching any other lines.
 * Only writes if the value isn't already there with the same content.
 */
function upsertEnvFile(key, value) {
  const envPath = path.join(root, '.env.local');
  const content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const lines = content.split('\n');
  const newLine = `${key}=${value}`;
  const idx = lines.findIndex((l) => l.startsWith(`${key}=`));
  if (idx >= 0) {
    if (lines[idx] === newLine) return; // already correct, nothing to write
    lines[idx] = newLine;
  } else {
    if (lines.length > 0 && lines[lines.length - 1] !== '') lines.push('');
    lines.push(newLine);
  }
  fs.writeFileSync(envPath, lines.join('\n'));
}

/* ── main ─────────────────────────────────────────────────────────────── */

loadDotEnv();

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const { host, port } = parseRedisUrl(redisUrl);

/* Fast path: Redis is already listening (started by `npm run launch`,
   a system Redis, Docker, etc.)                                         */
if (await pingRedis(redisUrl)) {
  console.log(`[ensure-redis] Redis already running at ${redisUrl}`);
  process.exit(0);
}

console.log('[ensure-redis] Redis is not running — looking for bundled binary...');

const manifest = readManifest();
const redisBin  = manifest.services?.redis?.executablePath;

if (!redisBin || !fs.existsSync(redisBin)) {
  console.warn('[ensure-redis] Bundled Redis binary not found.');
  console.warn('[ensure-redis] Run `npm run setup` or `./setup.sh` once to download it.');
  console.warn('[ensure-redis] Continuing — Next.js will start, but background jobs are paused.');
  process.exit(0); // non-fatal
}

/* Start the bundled binary as a detached daemon so it survives after
   this script (and even after `next dev`) exits.                        */
const dataDir = path.join(root, 'binaries', 'redis', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const redisProcess = spawn(
  redisBin,
  [
    '--bind',           host,
    '--port',           String(port),
    '--dir',            dataDir,
    '--save',           '',          // disable RDB persistence (ephemeral)
    '--appendonly',     'no',
    '--protected-mode', 'no',
    '--loglevel',       'warning',
  ],
  { stdio: 'ignore', detached: true },
);
redisProcess.unref();

/* Persist PID so scripts/stop-redis.mjs (or setup.sh --repair) can
   kill it cleanly if needed.                                            */
const pidPath = path.join(root, 'binaries', 'redis', 'redis.pid');
try { fs.writeFileSync(pidPath, String(redisProcess.pid)); } catch { /* best-effort */ }

console.log(`[ensure-redis] Redis started (PID ${redisProcess.pid}) — waiting for it to respond...`);

const ready = await waitForRedis(redisUrl, 10_000);

if (!ready) {
  console.warn(`[ensure-redis] Redis did not respond within 10 s at ${redisUrl}.`);
  console.warn('[ensure-redis] Continuing — background jobs will be queued until Redis is available.');
  process.exit(0); // still non-fatal
}

console.log(`[ensure-redis] Redis is ready at ${redisUrl}`);

/* Persist REDIS_URL in .env.local so every future `next dev` / `next
   start` picks it up without this script having to do anything extra. */
if (!process.env.REDIS_URL) {
  upsertEnvFile('REDIS_URL', redisUrl);
  console.log(`[ensure-redis] Wrote REDIS_URL=${redisUrl} to .env.local`);
}

process.exit(0);
