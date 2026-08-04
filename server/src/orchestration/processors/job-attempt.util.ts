import type { Job } from 'bullmq';

/**
 * BullMQ's Worker `'failed'` event fires on every attempt, including ones it
 * is about to automatically retry — not just the last one. `job.finishedOn`
 * is only set once BullMQ's own `shouldRetryJob()` decided there will be no
 * further attempt (attempts exhausted, job discarded, or an
 * `UnrecoverableError`, which skips retries regardless of attempts
 * remaining). Treating every attempt as final causes user-facing failure
 * handling (pausing the pipeline, showing Retry/Skip) to fire before the
 * automatic retry ever ran.
 */
export function isFinalJobAttempt(job: Pick<Job, 'finishedOn'>): boolean {
  return Boolean(job.finishedOn);
}
