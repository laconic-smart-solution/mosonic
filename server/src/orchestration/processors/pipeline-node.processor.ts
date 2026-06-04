import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
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
    this.logger.error(
      `[pipeline:${job.data.pipelineId}] worker job ${job.id} failed ` +
        `${job.data.nodeId}: ${error.message}`,
    );
    await this.runner.handleFinalFailure(job.data, error);
    if (job.opts.attempts && job.attemptsMade >= job.opts.attempts) {
      await this.dlq.add('failed-node', job.data, {
        jobId: pipelineNodeDlqJobId(String(job.id)),
      });
    }
  }
}
