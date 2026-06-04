import type { Queue, Job } from 'bullmq';
import {
  NEWS_TRIGGER_JOB_PROCESS_SINGLE,
} from './news-trigger.constants';
import type { NewsTriggerManualJobPayload } from './news-trigger.processor';

const MANUAL_JOB_STATES = [
  'active',
  'waiting',
  'delayed',
  'completed',
  'failed',
] as const;

function isManualPayload(data: unknown): data is NewsTriggerManualJobPayload {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.runId === 'string' &&
    typeof d.ruleId === 'string' &&
    typeof d.userId === 'string'
  );
}

export async function findManualJobForRun(
  queue: Queue,
  runId: string,
): Promise<Job<NewsTriggerManualJobPayload> | undefined> {
  const jobs = await queue.getJobs([...MANUAL_JOB_STATES], 0, 100);
  return jobs.find(
    (job) =>
      job.name === NEWS_TRIGGER_JOB_PROCESS_SINGLE &&
      isManualPayload(job.data) &&
      job.data.runId === runId,
  ) as Job<NewsTriggerManualJobPayload> | undefined;
}

export async function findInFlightManualJobForRule(
  queue: Queue,
  ruleId: string,
): Promise<Job<NewsTriggerManualJobPayload> | undefined> {
  const jobs = await queue.getJobs(['active', 'waiting', 'delayed'], 0, 100);
  return jobs.find(
    (job) =>
      job.name === NEWS_TRIGGER_JOB_PROCESS_SINGLE &&
      isManualPayload(job.data) &&
      job.data.ruleId === ruleId,
  ) as Job<NewsTriggerManualJobPayload> | undefined;
}
