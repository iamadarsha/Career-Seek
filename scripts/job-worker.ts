import { JobExecutor } from '../src/lib/jobs/executor';
import { JobService } from '../src/lib/jobs/service';

console.log('[Worker] Starting platform job worker...');

async function runWorker() {
  console.log('[Worker] Recovering interrupted jobs...');
  try {
    const recovered = await JobService.recoverInterruptedJobs();
    if (recovered > 0) {
      console.log(`[Worker] Recovered ${recovered} interrupted jobs`);
    }
  } catch (err) {
    console.error('[Worker] Failed to recover interrupted jobs:', err);
  }

  let lastCleanup = 0;
  const CLEANUP_INTERVAL = 60 * 1000; // Cleanup stalled jobs every minute

  while (true) {
    try {
      // Periodic cleanup of stalled jobs
      if (Date.now() - lastCleanup > CLEANUP_INTERVAL) {
        const cleaned = await JobService.cleanupStalledJobs();
        if (cleaned > 0) {
          console.log(`[Worker] Cleaned up ${cleaned} stalled jobs`);
        }
        lastCleanup = Date.now();
      }

      await JobExecutor.processQueue();
    } catch (error) {
      console.error('[Worker] Error in job loop:', error);
    }
    
    // Poll every 5 seconds
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}

// Handle termination
process.on('SIGINT', () => {
  console.log('[Worker] Shutting down...');
  process.exit(0);
});

runWorker();
