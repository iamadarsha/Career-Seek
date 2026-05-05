import dotenv from 'dotenv';
import Redis from 'ioredis';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function main() {
  const probe = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  probe.on('error', () => undefined);
  try {
    await probe.ping();
  } catch (error) {
    console.log(JSON.stringify({
      success: true,
      skipped: true,
      reason: 'Redis is not reachable; start it with docker compose or set REDIS_URL.',
      error: error instanceof Error ? error.message : String(error),
    }, null, 2));
    probe.disconnect();
    return;
  }
  await probe.quit();

  const { aiQueue, documentQueue, emailQueue, scrapeQueue } = await import('../../src/lib/queue/queues');
  const { redisConnection } = await import('../../src/lib/queue/connection');
  const queues = [scrapeQueue, documentQueue, emailQueue, aiQueue];
  const snapshots = await Promise.all(queues.map(async (queue) => ({
    name: queue.name,
    counts: await queue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed'),
  })));

  console.log(JSON.stringify({
    success: true,
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
    queues: snapshots,
  }, null, 2));

  await Promise.all(queues.map((queue) => queue.close()));
  await redisConnection.quit();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
