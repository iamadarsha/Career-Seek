import Redis from 'ioredis';
import { logger } from '@/lib/logger';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

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

export async function assertRedisReady(timeoutMs = 2_000) {
  const probe = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
    connectTimeout: timeoutMs,
  });
  probe.on('error', () => undefined);
  try {
    await probe.ping();
  } catch (error) {
    throw new Error(`Redis is required for background jobs but is not reachable at ${redisUrl}. Run ./setup.sh --repair, run npm run launch, or set REDIS_URL to a reachable local Redis.`);
  } finally {
    probe.disconnect();
  }
}
