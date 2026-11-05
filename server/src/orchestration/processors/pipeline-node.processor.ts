import { InjectQueue } from '@nestjs/bullmq';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue, Worker } from 'bullmq';
import {
  buildRedisConnectionOptions,
  redisEnvFromConfig,
} from '../../config/redis-connection.util';
import { DependencyResolverService } from '../dependency-resolver.service';
import { PipelineNodeRunnerService } from '../pipeline-node-runner.service';
import { allQueueNamesForBase } from '../queue-tenant.util';
import {
  type NodeJobPayload,
  PIPELINE_NODES_DLQ,
  PIPELINE_NODES_QUEUE,
  pipelineNodeDlqJobId,
} from '../types/node-job.payload';
import { isFinalJobAttempt } from './job-attempt.util';

/**
 * Runs `pipeline_nodes` jobs. When QUEUE_TENANT_ISOLATION=true this base
 * queue is sharded into `QUEUE_TENANT_BUCKETS` bucket queues (registered in
 * orchestration.module.ts) instead of one global queue, so one user's
 * backlog can't starve everyone else's jobs. `@Processor` can only bind a
 * single, statically-known queue name, so this runs one raw BullMQ `Worker`
 * per bucket instead — all sharing the exact same processing logic below —
 * which collapses back to a single worker when isolation is off.
 */
@Injectable()
export class PipelineNodeProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PipelineNodeProcessor.name);
  private workers: Worker<NodeJobPayload>[] = [];

  constructor(
    private readonly runner: PipelineNodeRunnerService,
    private readonly resolver: DependencyResolverService,
    private readonly config: ConfigService,
    @InjectQueue(PIPELINE_NODES_DLQ)
    private readonly dlq: Queue<NodeJobPayload>,
  ) {}

  onModuleInit(): void {
    const connection = buildRedisConnectionOptions(
      redisEnvFromConfig(this.config),
    );
    const concurrency = Number(process.env.QUEUE_CONCURRENCY ?? 5);
    const names = allQueueNamesForBase(PIPELINE_NODES_QUEUE);
    for (const name of names) {
      const worker = new Worker<NodeJobPayload>(
        name,
        (job) => this.process(job),
        { connection, concurrency },
      );
      worker.on('completed', (job) => void this.onCompleted(job));
      worker.on('failed', (job, error) => void this.onFailed(job, error));
      this.workers.push(worker);
    }
    this.logger.log(
      `${PIPELINE_NODES_QUEUE} worker started on ${names.length} queue(s): ${names.join(', ')}`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(this.workers.map((worker) => worker.close()));
  }

  private async process(job: Job<NodeJobPayload>): Promise<void> {
    const { pipelineId, nodeId, nodeType } = job.data;
    this.logger.log(
      `[pipeline:${pipelineId}] worker job ${job.id} ${nodeId}(${nodeType}) attempt=${job.attemptsMade + 1}`,
    );
    await this.runner.run(job.data);
    await this.resolver.maybeFinalize(job.data.pipelineId);
    this.logger.log(
      `[pipeline:${pipelineId}] worker job ${job.id} finished ${nodeId}`,
    );
  }

  private async onCompleted(job: Job<NodeJobPayload>): Promise<void> {
    await this.resolver.maybeFinalize(job.data.pipelineId);
  }

  private async onFailed(
    job: Job<NodeJobPayload> | undefined,
    error: Error,
  ): Promise<void> {
    if (!job?.data) {
      return;
    }
    if (!isFinalJobAttempt(job)) {
      this.logger.warn(
        `[pipeline:${job.data.pipelineId}] worker job ${job.id} attempt ` +
          `${job.attemptsMade}/${job.opts.attempts ?? 1} failed for ` +
          `${job.data.nodeId}, will retry: ${error.message}`,
      );
      return;
    }
    this.logger.error(
      `[pipeline:${job.data.pipelineId}] worker job ${job.id} failed ` +
        `${job.data.nodeId}: ${error.message}`,
    );
    await this.runner.handleFinalFailure(job.data, error);
    await this.dlq.add('failed-node', job.data, {
      jobId: pipelineNodeDlqJobId(String(job.id)),
    });
  }
}
