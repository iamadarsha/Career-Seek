import dotenv from 'dotenv';
import { Worker, type Job } from 'bullmq';
import nodemailer from 'nodemailer';
import { logger } from '../src/lib/logger';
import { getAIManager } from '../src/lib/ai/manager';
import { JobService } from '../src/lib/jobs/service';
import { executePlatformJobFromBull } from '../src/lib/queue/execute-platform-job';
import { createRedisConnection } from '../src/lib/queue/connection';
import {
  AI_QUEUE_NAME,
  DOCUMENT_QUEUE_NAME,
  EMAIL_QUEUE_NAME,
  SCRAPE_QUEUE_NAME,
  type AiJobPayload,
  type DocumentJobPayload,
  type EmailJobPayload,
  deadLetterQueueForName,
} from '../src/lib/queue/queues';
import {
  mirrorWorkerFailed,
  mirrorWorkerProgress,
  mirrorWorkerRetry,
  mirrorWorkerStarted,
  mirrorWorkerSucceeded,
} from '../src/lib/queue/platform-job-mirror';
import { waitForRedisWindow } from '../src/lib/queue/redis-rate-limit';
import { checkBrowserlessReadiness } from '../src/lib/services/documents/browserless';
import { mirrorFileToLocalObjectStore } from '../src/lib/services/storage/local-object-store';

dotenv.config({ path: '.env.local' });
dotenv.config();

const workers: Worker[] = [];

function workerConnection() {
  return createRedisConnection();
}

function attachWorkerEvents(worker: Worker) {
  worker.on('completed', (job) => {
    logger.info({ queue: worker.name, bullJobId: job.id }, 'BullMQ job completed');
  });
  worker.on('failed', async (job, error) => {
    if (job && job.attemptsMade < (job.opts.attempts || 1)) {
      await mirrorWorkerRetry(job, error);
      return;
    }
    await mirrorWorkerFailed(job, error);
    if (job) {
      const deadLetterQueue = deadLetterQueueForName(worker.name);
      await deadLetterQueue?.add('final_failure', {
        queue: worker.name,
        bullJobId: job.id,
        name: job.name,
        data: job.data,
        attemptsMade: job.attemptsMade,
        failedReason: error instanceof Error ? error.message : String(error),
        failedAt: new Date().toISOString(),
      });
    }
    logger.error({ err: error, queue: worker.name, bullJobId: job?.id }, 'BullMQ job failed');
  });
  worker.on('error', (error) => {
    logger.error({ err: error, queue: worker.name }, 'BullMQ worker error');
  });
}

async function processDocumentJob(job: Job<DocumentJobPayload>) {
  await mirrorWorkerStarted(job);
  await mirrorWorkerProgress(job, 10);
  const { generateResumePipeline, generateCoverLetterAction, generateOutreachNoteAction } = await import('../src/app/discover/document-actions');
  const readiness = await checkBrowserlessReadiness(false);

  const payload = job.data;
  const result = payload.action === 'generate_resume'
    ? await generateResumePipeline(payload.scoredJobId)
    : payload.action === 'generate_cover_letter'
      ? await generateCoverLetterAction(payload.scoredJobId)
      : await generateOutreachNoteAction(payload.scoredJobId);

  await mirrorWorkerProgress(job, 85);
  const filePaths = [result.filePath, (result as { pdfPath?: string }).pdfPath].filter((value): value is string => Boolean(value));
  const storage = [];
  for (const filePath of filePaths) {
    storage.push(await mirrorFileToLocalObjectStore(filePath, `documents/${payload.scoredJobId}/${filePath.split('/').pop()}`, {
      action: payload.action,
      scoredJobId: payload.scoredJobId,
      browserlessAvailable: readiness.available,
    }));
  }

  const finalResult = { ...result, storage, browserless: readiness };
  await mirrorWorkerProgress(job, 100);
  await mirrorWorkerSucceeded(job, finalResult);
  return finalResult;
}

async function processAiJob(job: Job<AiJobPayload>) {
  await mirrorWorkerStarted(job);
  const providerKey = job.data.providerRateLimitKey || job.data.request.provider || 'default';
  await waitForRedisWindow(`ai:${providerKey}`, 10, 60_000);
  await mirrorWorkerProgress(job, 20);
  const response = await getAIManager().generate(job.data.request);
  const result = {
    id: response.id,
    provider: response.provider,
    model: response.model,
    responseFormat: response.responseFormat,
    usage: response.usage,
    latencyMs: response.latencyMs,
    parsed: response.parsed,
    text: response.text,
  };
  await mirrorWorkerProgress(job, 100);
  await mirrorWorkerSucceeded(job, result);
  return result;
}

async function processEmailJob(job: Job<EmailJobPayload>) {
  await mirrorWorkerStarted(job);
  const payload = job.data;
  if (!payload.to) {
    const skipped = { skipped: true, reason: 'No recipient email configured.' };
    await mirrorWorkerSucceeded(job, skipped);
    return skipped;
  }

  const transport = nodemailer.createTransport({
    host: process.env.MAILPIT_SMTP_HOST || '127.0.0.1',
    port: Number(process.env.MAILPIT_SMTP_PORT || 1025),
    secure: false,
  });

  await mirrorWorkerProgress(job, 50);
  const info = await transport.sendMail({
    from: process.env.CAREER_SEEK_EMAIL_FROM || 'Career Seek <career-seek@localhost>',
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
  });
  const result = { messageId: info.messageId, accepted: info.accepted, rejected: info.rejected };
  await mirrorWorkerProgress(job, 100);
  await mirrorWorkerSucceeded(job, result);
  return result;
}

function startWorkers() {
  const scrapeWorker = new Worker(SCRAPE_QUEUE_NAME, executePlatformJobFromBull, {
    connection: workerConnection(),
    concurrency: 2,
    limiter: { max: 4, duration: 60_000 },
  });

  const documentWorker = new Worker<DocumentJobPayload>(DOCUMENT_QUEUE_NAME, processDocumentJob, {
    connection: workerConnection(),
    concurrency: 1,
  });

  const aiWorker = new Worker<AiJobPayload>(AI_QUEUE_NAME, processAiJob, {
    connection: workerConnection(),
    concurrency: 2,
    limiter: { max: 12, duration: 60_000 },
  });

  const emailWorker = new Worker<EmailJobPayload>(EMAIL_QUEUE_NAME, processEmailJob, {
    connection: workerConnection(),
    concurrency: 2,
  });

  workers.push(scrapeWorker, documentWorker, aiWorker, emailWorker);
  workers.forEach(attachWorkerEvents);
}

async function shutdown(signal: string) {
  logger.info({ signal }, 'BullMQ worker shutdown requested; draining active jobs');
  await Promise.all(workers.map((worker) => worker.close()));
  logger.info('BullMQ workers closed cleanly');
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

JobService.recoverInterruptedJobs()
  .then((count) => {
    if (count > 0) {
      logger.warn({ count }, 'Recovered interrupted platform jobs on worker startup');
    }
    startWorkers();
    logger.info('BullMQ workers started');
  })
  .catch((error) => {
    logger.error({ err: error }, 'Could not recover interrupted jobs before worker startup');
    startWorkers();
    logger.info('BullMQ workers started after recovery warning');
  });
