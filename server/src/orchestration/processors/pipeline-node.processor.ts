import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue, UnrecoverableError } from 'bullmq';
import { EventsService } from '../../events/events.service';
import { DependencyResolverService } from '../dependency-resolver.service';
import { PipelineNodeRunnerService } from '../pipeline-node-runner.service';
import {
  type NodeJobPayload,
  PIPELINE_NODES_DLQ,
  PIPELINE_NODES_QUEUE,
  pipelineNodeDlqJobId,
} from '../types/node-job.payload';

@Processor(PIPELINE_NODES_QUEUE, {
  concurrency: Number(process.env.QUEUE_CONCURRENCY ?? 5),
})
export class PipelineNodeProcessor extends WorkerHost {
  private readonly logger = new Logger(PipelineNodeProcessor.name);

  constructor(
    private readonly runner: PipelineNodeRunnerService,
    private readonly resolver: DependencyResolverService,
    private readonly events: EventsService,
    @InjectQueue(PIPELINE_NODES_DLQ)
    private readonly dlq: Queue<NodeJobPayload>,
  ) {
    super();
  }

  async process(job: Job<NodeJobPayload>): Promise<void> {
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

  @OnWorkerEvent('completed')
  async onCompleted(job: Job<NodeJobPayload>): Promise<void> {
    await this.resolver.maybeFinalize(job.data.pipelineId);
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<NodeJobPayload> | undefined, error: Error): Promise<void> {
    if (!job?.data) {
      return;
    }
    const maxAttempts = job.opts.attempts ?? 1;
    const exhausted = job.attemptsMade >= maxAttempts;
    const unrecoverable = error instanceof UnrecoverableError;

    // Match video processor: only pause + emit failed_final when retries are done.
    // Calling handleFinalFailure on attempt 1 left a delayed BullMQ retry that raced
    // user Retry/Skip (especially visible on image_generation failures).
    if (!exhausted && !unrecoverable) {
      this.logger.warn(
        `[pipeline:${job.data.pipelineId}] worker job ${job.id} failed ` +
          `${job.data.nodeId} attempt=${job.attemptsMade}/${maxAttempts}: ${error.message}`,
      );
      this.events.emitToPipeline(job.data.pipelineId, 'node:retrying', {
        pipelineId: job.data.pipelineId,
        nodeId: job.data.nodeId,
        nodeType: job.data.nodeType,
        attempt: job.attemptsMade + 1,
        maxAttempts,
      });
      return;
    }

    this.logger.error(
      `[pipeline:${job.data.pipelineId}] worker job ${job.id} failed ` +
        `${job.data.nodeId}: ${error.message}`,
    );
    await this.runner.handleFinalFailure(job.data, error);
    if (exhausted) {
      await this.dlq.add('failed-node', job.data, {
        jobId: pipelineNodeDlqJobId(String(job.id)),
      });
    }
  }
}
