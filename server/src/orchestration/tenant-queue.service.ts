import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import {
  allQueueNamesForBase,
  tenantPipelineQueueName,
} from './queue-tenant.util';

/**
 * Resolves the physical (optionally tenant-sharded) BullMQ Queue backing a
 * logical base queue name. When QUEUE_TENANT_ISOLATION=true, each base queue
 * (pipeline_nodes, video_generate, video_check) is statically registered as
 * `QUEUE_TENANT_BUCKETS` bucket queues at module init (see
 * orchestration.module.ts) — NestJS/BullMQ queues are bound at bootstrap,
 * not created per-request, so a userId can't get its own dedicated queue
 * without this fixed-bucket indirection. This service maps a userId to the
 * right bucket queue at runtime via ModuleRef, since `@InjectQueue` can only
 * bind a single, statically-known queue name per constructor param.
 */
@Injectable()
export class TenantQueueService {
  constructor(private readonly moduleRef: ModuleRef) {}

  /** The one queue this user's jobs for `baseQueue` should go through. */
  forUser<T = unknown>(baseQueue: string, userId: string): Queue<T> {
    return this.resolve<T>(tenantPipelineQueueName(baseQueue, userId));
  }

  /** Every physical queue backing `baseQueue` — for sweeps that must check every shard. */
  all<T = unknown>(baseQueue: string): Queue<T>[] {
    return allQueueNamesForBase(baseQueue).map((name) => this.resolve<T>(name));
  }

  private resolve<T>(name: string): Queue<T> {
    const queue = this.moduleRef.get<Queue<T>>(getQueueToken(name), {
      strict: false,
    });
    if (!queue) {
      throw new Error(
        `Queue "${name}" is not registered — check orchestration.module.ts ` +
          'queue registration and the QUEUE_TENANT_ISOLATION/QUEUE_TENANT_BUCKETS env vars.',
      );
    }
    return queue;
  }
}
