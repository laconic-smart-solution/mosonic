import { createHash } from 'node:crypto';

const BUCKET_COUNT = Number(process.env.QUEUE_TENANT_BUCKETS ?? 32);

/** Hash userId into a fixed bucket for optional tenant queue isolation. */
export function tenantQueueBucket(userId: string): string {
  const hash = createHash('sha256').update(userId.trim()).digest('hex');
  const bucket = parseInt(hash.slice(0, 8), 16) % Math.max(BUCKET_COUNT, 1);
  return `b${bucket}`;
}

export function tenantPipelineQueueName(baseQueue: string, userId: string): string {
  if (process.env.QUEUE_TENANT_ISOLATION !== 'true') {
    return baseQueue;
  }
  return `${baseQueue}:${tenantQueueBucket(userId)}`;
}
