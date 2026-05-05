import { randomUUID } from 'crypto';
import { redisConnection } from './connection';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForRedisWindow(key: string, limit: number, windowMs: number) {
  const normalizedLimit = Math.max(1, limit);
  const normalizedWindow = Math.max(1_000, windowMs);

  while (true) {
    const now = Date.now();
    const redisKey = `career-seek:rate:${key}`;
    await redisConnection.zremrangebyscore(redisKey, 0, now - normalizedWindow);
    const count = await redisConnection.zcard(redisKey);
    if (count < normalizedLimit) {
      await redisConnection.zadd(redisKey, now, `${now}:${randomUUID()}`);
      await redisConnection.pexpire(redisKey, normalizedWindow * 2);
      return;
    }

    const oldest = await redisConnection.zrange(redisKey, 0, 0, 'WITHSCORES');
    const oldestScore = Number(oldest[1] || now);
    await sleep(Math.max(250, normalizedWindow - (now - oldestScore)));
  }
}
