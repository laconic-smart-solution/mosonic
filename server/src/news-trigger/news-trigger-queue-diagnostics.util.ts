import type { Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';

export async function logNewsTriggerQueueState(
  queue: Queue,
  logger: Logger,
  context: string,
): Promise<Record<string, number>> {
  const counts = await queue.getJobCounts(
    'waiting',
    'active',
    'delayed',
    'failed',
    'completed',
    'paused',
  );
  logger.log(`[NewsTrigger] ${context} queueCounts=${JSON.stringify(counts)}`);
  return counts;
}

export function workersInApiProcessLabel(): string {
  return String(process.env.RUN_WORKERS_IN_API !== 'false');
}
