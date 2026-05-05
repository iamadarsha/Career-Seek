import { JobService } from '@/lib/jobs/service';
import type { EnqueueJobInput, JobType, PlatformJob } from '@/lib/jobs/types';
import {
  aiQueue,
  documentQueue,
  emailQueue,
  queueForJobType,
  scrapeQueue,
  type AiJobPayload,
  type DocumentJobPayload,
  type EmailJobPayload,
  type ScrapeJobPayload,
} from './queues';
import { assertRedisReady } from './connection';

function bullPriority(priority?: number) {
  if (!priority || priority <= 0) return undefined;
  return Math.max(1, 1_000 - Math.min(priority, 999));
}

async function addBullJob<TPayload extends { platformJobId?: number }>(
  queue: { add: (name: string, payload: TPayload, options?: any) => Promise<any> },
  name: string,
  platformJob: PlatformJob,
  payload: TPayload,
) {
  await queue.add(name, { ...payload, platformJobId: platformJob.id }, {
    jobId: `platform_${platformJob.id}`,
    priority: bullPriority(platformJob.priority || 0),
  });
  await JobService.log(platformJob.id, 'info', `BullMQ job added to ${name}`);
  return platformJob;
}

export async function enqueuePlatformJob<TPayload>(input: EnqueueJobInput<TPayload>) {
  await assertRedisReady();
  const platformJob = await JobService.enqueue(input);
  const queue = queueForJobType(input.jobType as JobType);
  return addBullJob(queue as any, input.jobType, platformJob, input.payload as any);
}

export async function enqueueScrapeJob(payload: ScrapeJobPayload, options: Partial<EnqueueJobInput<ScrapeJobPayload>> = {}) {
  await assertRedisReady();
  const platformJob = await JobService.enqueue({
    jobType: 'scan_jobs',
    payload,
    priority: options.priority ?? 10,
    maxAttempts: options.maxAttempts ?? 4,
    userId: options.userId ?? payload.userId,
    profileId: options.profileId ?? payload.profileId,
  });
  return addBullJob(scrapeQueue, 'scan_jobs', platformJob, payload);
}

export async function enqueueDocumentJob(payload: DocumentJobPayload, options: Partial<EnqueueJobInput<DocumentJobPayload>> = {}) {
  await assertRedisReady();
  const jobType = payload.action as Extract<JobType, 'generate_resume' | 'generate_cover_letter' | 'generate_outreach'>;
  const platformJob = await JobService.enqueue({
    jobType,
    payload,
    priority: options.priority ?? 5,
    maxAttempts: options.maxAttempts ?? 4,
    userId: options.userId ?? payload.userId,
    profileId: options.profileId ?? payload.profileId,
  });
  return addBullJob(documentQueue, jobType, platformJob, payload);
}

export async function enqueueEmailJob(payload: EmailJobPayload, options: Partial<EnqueueJobInput<EmailJobPayload>> = {}) {
  await assertRedisReady();
  const platformJob = await JobService.enqueue({
    jobType: 'run_reminders',
    payload,
    priority: options.priority ?? 1,
    maxAttempts: options.maxAttempts ?? 4,
    userId: options.userId ?? payload.userId,
    profileId: options.profileId ?? payload.profileId,
  });
  return addBullJob(emailQueue, 'email', platformJob, payload);
}

export async function enqueueAiJob(payload: AiJobPayload, options: Partial<EnqueueJobInput<AiJobPayload>> = {}) {
  await assertRedisReady();
  const platformJob = await JobService.enqueue({
    jobType: options.jobType || 'recompute_analytics',
    payload,
    priority: options.priority ?? 3,
    maxAttempts: options.maxAttempts ?? 4,
    userId: options.userId ?? payload.userId,
    profileId: options.profileId ?? payload.profileId,
  });
  return addBullJob(aiQueue, 'ai_generation', platformJob, payload);
}
