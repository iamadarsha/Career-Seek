import type { JobType, JobHandler } from './types';
import { scanJobHandler } from './handlers/scan-handler';
import { scoreJobHandler } from './handlers/score-handler';
import { enrichJobHandler } from './handlers/enrich-handler';

// Registry of job handlers
const registry = new Map<JobType, JobHandler<any, any>>();

// Register built-in handlers
registry.set('scan_jobs', scanJobHandler);
registry.set('score_jobs', scoreJobHandler);
registry.set('enrich_jobs', enrichJobHandler);

/**
 * Register a job handler for a specific job type.
 */
export function registerHandler<TPayload, TResult>(
  jobType: JobType,
  handler: JobHandler<TPayload, TResult>
) {
  registry.set(jobType, handler);
}

/**
 * Get a handler for a job type.
 */
export function getHandler(jobType: JobType): JobHandler<any, any> | undefined {
  return registry.get(jobType);
}
