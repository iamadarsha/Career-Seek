import Redis from 'ioredis';
import { logger } from '@/lib/logger';

/**
 * FIX #6: resolve Redis URL lazily at connection time instead of at module load.
 * Previously `const redisUrl = process.env.REDIS_URL` was evaluated once when
 * the module was first imported — if REDIS_URL was written to .env.local after
 * that point it was permanently ignored for the lifetime of the process.
 */
function getRedisUrl(): string {
  try {
    const { readEnvKeys } = require('@/lib/env-writer') as typeof import('@/lib/env-writer');
    const live = readEnvKeys(['REDIS_URL']);
    if (live.REDIS_URL) return live.REDIS_URL;
  } catch {
    // non-fatal — fall through
  }
  return process.env.REDIS_URL || 'redis://127.0.0.1:6379';
}

export function createRedisConnection() {
  const redisUrl = getRedisUrl(); // FIX #6: resolved lazily
  const connection = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: true,
  });

  connection.on('error', (error) => {
    logger.warn({ err: error, redisUrl }, 'Redis connection error');
  });

  return connection;
}

export const redisConnection = createRedisConnection();

export async function closeRedisConnection() {
  if (redisConnection.status !== 'end') {
    await redisConnection.quit().catch(() => redisConnection.disconnect());
  }
}

export async function assertRedisReady(timeoutMs = 3_000) {
  const redisUrl = getRedisUrl(); // FIX #6: resolved lazily
  const probe = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
    connectTimeout: timeoutMs,
    enableOfflineQueue: false,
  });
  probe.on('error', () => undefined);
  try {
    await probe.connect();
    await probe.ping();
  } catch (error) {
    throw new Error(`Redis is not reachable at ${redisUrl}. Restart the app with \`npm run dev\` — it will auto-start the bundled Redis. If this is a fresh install, run \`npm run setup\` first.`);
  } finally {
    probe.disconnect();
  }
}
