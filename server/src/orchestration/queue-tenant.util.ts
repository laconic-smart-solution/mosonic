import { createHash } from 'node:crypto';

function bucketCount(): number {
  return Number(process.env.QUEUE_TENANT_BUCKETS ?? 32);
}

/** True when jobs should be sharded across per-tenant bucket queues. */
export function tenantQueueIsolationEnabled(): boolean {
  return process.env.QUEUE_TENANT_ISOLATION === 'true';
}

/** Hash userId into a fixed bucket for optional tenant queue isolation. */
export function tenantQueueBucket(userId: string): string {
  const hash = createHash('sha256').update(userId.trim()).digest('hex');
  const bucket = parseInt(hash.slice(0, 8), 16) % Math.max(bucketCount(), 1);
  return `b${bucket}`;
}

/** BullMQ queue names must not contain `:` (it's Redis's own key separator). */
const BUCKET_SEP = '__';

/** The physical queue name a given user's jobs for `baseQueue` route through. */
export function tenantPipelineQueueName(
  baseQueue: string,
  userId: string,
): string {
  if (!tenantQueueIsolationEnabled()) {
    return baseQueue;
  }
  return `${baseQueue}${BUCKET_SEP}${tenantQueueBucket(userId)}`;
}

/**
 * Every physical BullMQ queue name backing one logical base queue: just the
 * base name when tenant isolation is off, or all `QUEUE_TENANT_BUCKETS`
 * shard names (`base__b0`..`base__b{N-1}`) when it's on. Used to statically
 * register every shard at module init (NestJS/BullMQ queues are bound at
 * bootstrap, not created per-request) and to sweep every shard in cleanup
 * paths that don't know which bucket a given job landed in.
 */
export function allQueueNamesForBase(baseQueue: string): string[] {
  if (!tenantQueueIsolationEnabled()) {
    return [baseQueue];
  }
  return Array.from(
    { length: Math.max(bucketCount(), 1) },
    (_, i) => `${baseQueue}${BUCKET_SEP}b${i}`,
  );
}
