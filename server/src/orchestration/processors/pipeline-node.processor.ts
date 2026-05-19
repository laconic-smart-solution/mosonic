import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
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
  constructor(
    private readonly runner: PipelineNodeRunnerService,
    private readonly resolver: DependencyResolverService,
    @InjectQueue(PIPELINE_NODES_DLQ)
    private readonly dlq: Queue<NodeJobPayload>,
  ) {
    super();
  }

  async process(job: Job<NodeJobPayload>): Promise<void> {
    await this.runner.run(job.data);
    await this.resolver.maybeFinalize(job.data.pipelineId);
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
    await this.runner.handleFinalFailure(job.data, error);
    if (job.opts.attempts && job.attemptsMade >= job.opts.attempts) {
      await this.dlq.add('failed-node', job.data, {
        jobId: pipelineNodeDlqJobId(String(job.id)),
      });
    }
  }
}
