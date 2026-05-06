import Redis from 'ioredis';
import { logger } from '@/lib/logger';

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

export function createRedisConnection() {
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
