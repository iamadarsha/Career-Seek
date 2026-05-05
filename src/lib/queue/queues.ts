import { Queue, type JobsOptions } from 'bullmq';
import type { AIGenerateRequest } from '@/lib/ai/types';
import { createRedisConnection } from './connection';
import type { JobType } from '@/lib/jobs/types';

export const SCRAPE_QUEUE_NAME = 'career-seek-scrape';
export const DOCUMENT_QUEUE_NAME = 'career-seek-document';
export const EMAIL_QUEUE_NAME = 'career-seek-email';
export const AI_QUEUE_NAME = 'career-seek-ai';
export const DEAD_LETTER_SUFFIX = '-dead-letter';

export interface QueuePayloadBase {
  platformJobId?: number;
  userId?: number;
  profileId?: number;
}

export interface ScrapeJobPayload extends QueuePayloadBase {
  searchProfileId: number;
  selectedPortals?: string[];
  bypassCache?: boolean;
}

export interface DocumentJobPayload extends QueuePayloadBase {
  action: 'generate_resume' | 'generate_cover_letter' | 'generate_outreach';
  scoredJobId: number;
  notifyEmail?: string;
}

export interface EmailJobPayload extends QueuePayloadBase {
  to?: string;
  subject: string;
  text?: string;
  html?: string;
}

export interface AiJobPayload extends QueuePayloadBase {
  taskType: string;
  providerRateLimitKey?: string;
  request: AIGenerateRequest;
}

export type PlatformBullPayload =
  | ScrapeJobPayload
  | DocumentJobPayload
  | EmailJobPayload
  | AiJobPayload;

export const defaultJobOptions: JobsOptions = {
  attempts: 4,
  backoff: {
    type: 'exponential',
    delay: 30_000,
  },
  removeOnComplete: {
    age: 24 * 60 * 60,
    count: 500,
  },
  removeOnFail: {
    age: 7 * 24 * 60 * 60,
    count: 1_000,
  },
};

const deadLetterJobOptions: JobsOptions = {
  removeOnComplete: { age: 30 * 24 * 60 * 60, count: 2_000 },
  removeOnFail: { age: 30 * 24 * 60 * 60, count: 2_000 },
};

export const scrapeQueue = new Queue<ScrapeJobPayload>(SCRAPE_QUEUE_NAME, {
  connection: createRedisConnection(),
  defaultJobOptions,
});

export const documentQueue = new Queue<DocumentJobPayload>(DOCUMENT_QUEUE_NAME, {
  connection: createRedisConnection(),
  defaultJobOptions,
});

export const emailQueue = new Queue<EmailJobPayload>(EMAIL_QUEUE_NAME, {
  connection: createRedisConnection(),
  defaultJobOptions,
});

export const aiQueue = new Queue<AiJobPayload>(AI_QUEUE_NAME, {
  connection: createRedisConnection(),
  defaultJobOptions,
});

export const scrapeDeadLetterQueue = new Queue(`${SCRAPE_QUEUE_NAME}${DEAD_LETTER_SUFFIX}`, {
  connection: createRedisConnection(),
  defaultJobOptions: deadLetterJobOptions,
});

export const documentDeadLetterQueue = new Queue(`${DOCUMENT_QUEUE_NAME}${DEAD_LETTER_SUFFIX}`, {
  connection: createRedisConnection(),
  defaultJobOptions: deadLetterJobOptions,
});

export const emailDeadLetterQueue = new Queue(`${EMAIL_QUEUE_NAME}${DEAD_LETTER_SUFFIX}`, {
  connection: createRedisConnection(),
  defaultJobOptions: deadLetterJobOptions,
});

export const aiDeadLetterQueue = new Queue(`${AI_QUEUE_NAME}${DEAD_LETTER_SUFFIX}`, {
  connection: createRedisConnection(),
  defaultJobOptions: deadLetterJobOptions,
});

export const platformQueues = [scrapeQueue, documentQueue, emailQueue, aiQueue] as const;
export const deadLetterQueues = [scrapeDeadLetterQueue, documentDeadLetterQueue, emailDeadLetterQueue, aiDeadLetterQueue] as const;

export function queueForJobType(jobType: JobType) {
  if (jobType === 'scan_jobs' || jobType === 'score_jobs' || jobType === 'enrich_jobs') return scrapeQueue;
  if (jobType === 'generate_resume' || jobType === 'generate_cover_letter' || jobType === 'generate_outreach') return documentQueue;
  if (jobType === 'run_reminders') return emailQueue;
  return aiQueue;
}

export function deadLetterQueueForName(queueName: string) {
  if (queueName === SCRAPE_QUEUE_NAME) return scrapeDeadLetterQueue;
  if (queueName === DOCUMENT_QUEUE_NAME) return documentDeadLetterQueue;
  if (queueName === EMAIL_QUEUE_NAME) return emailDeadLetterQueue;
  if (queueName === AI_QUEUE_NAME) return aiDeadLetterQueue;
  return null;
}
