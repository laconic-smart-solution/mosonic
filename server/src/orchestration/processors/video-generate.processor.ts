import {
  InjectQueue,
  OnWorkerEvent,
  Processor,
  WorkerHost,
} from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import {
  getVideoGenerationMode,
  VideoGenerationService,
} from '../../nodes/services/video-generation.service';
import { PipelineRepository } from '../../pipeline/pipeline.repository';
import { PipelineNodeExecutionStatus } from '../../pipeline/schemas/pipeline.schema';
import { MediaNodeCompletionService } from '../media-node-completion.service';
import { POLL_CONFIG, QUEUES, videoCheckJobId } from '../types/queue.constants';
import type { MediaCheckJobPayload } from '../types/media-check-job.payload';
import type { NodeJobPayload } from '../types/node-job.payload';

@Processor(QUEUES.VIDEO_GENERATE, {
  concurrency: Number(process.env.VIDEO_GENERATE_CONCURRENCY ?? 3),
})
export class VideoGenerateProcessor extends WorkerHost {
  private readonly logger = new Logger(VideoGenerateProcessor.name);

  constructor(
    private readonly pipelineRepo: PipelineRepository,
    private readonly videoService: VideoGenerationService,
    private readonly completion: MediaNodeCompletionService,
    @InjectQueue(QUEUES.VIDEO_CHECK)
    private readonly videoCheckQueue: Queue<MediaCheckJobPayload>,
  ) {
    super();
  }

  async process(job: Job<NodeJobPayload>): Promise<void> {
    const payload = job.data;
    const { pipelineId, nodeId } = payload;

    this.logger.log(`[video:submit] pipeline=${pipelineId} node=${nodeId}`);

    let videoProvider: 'sora' | 'heygen' = 'sora';
    try {
      const input = await this.completion.buildVideoGenerationInput(payload);

      await this.pipelineRepo.updateNodeStatus(
        pipelineId,
        nodeId,
        PipelineNodeExecutionStatus.Running,
      );

      const isPresenter =
        getVideoGenerationMode(input.config) === 'presenter';
      videoProvider = isPresenter ? 'heygen' : 'sora';

      await this.videoService.emitProcessing(
        pipelineId,
        nodeId,
        isPresenter
          ? 'Presenter video generation started...'
          : 'Video generation started...',
      );

      const submitResult = isPresenter
        ? await this.videoService.submitPresenterVideoJob(input)
        : await this.videoService.submitVideoJob(input);

      const { externalJobId, estimatedSeconds, normalized } = submitResult;
      videoProvider = submitResult.videoProvider ?? videoProvider;

      await this.pipelineRepo.saveExternalJobId(
        pipelineId,
        nodeId,
        externalJobId,
      );

      const delayMs = Math.max(
        10_000,
        Math.round((estimatedSeconds ?? 60) * 1000 * 0.8),
        POLL_CONFIG.video.initialDelayMs,
      );

      const checkPayload: MediaCheckJobPayload = {
        ...payload,
        externalJobId,
        checkCount: 0,
        submittedAt: new Date().toISOString(),
        videoProvider: videoProvider ?? (isPresenter ? 'heygen' : 'sora'),
        normalized,
      };

      await this.videoCheckQueue.add('video_check', checkPayload, {
        jobId: videoCheckJobId(pipelineId, nodeId, 0),
        delay: delayMs,
        attempts: 1,
      });

      await this.videoService.emitProcessing(
        pipelineId,
        nodeId,
        `Video job submitted. Checking in ${Math.round(delayMs / 1000)}s`,
      );

      this.logger.log(
        `[video:submit] externalJobId=${externalJobId} delayMs=${delayMs}`,
      );
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error(String(err ?? 'Submit failed'));
      const isFinal =
        job.opts.attempts && job.attemptsMade >= job.opts.attempts;
      if (isFinal) {
        this.logger.error(
          `[video:submit] failed pipeline=${pipelineId} node=${nodeId} provider=${videoProvider}: ${error.message}`,
          error.stack,
        );
        await this.completion.failVideoNode(payload, error, {
          videoProvider,
          stage: 'submit',
        });
      } else {
        this.logger.warn(
          `[video:submit] attempt ${job.attemptsMade + 1} failed pipeline=${pipelineId}: ${error.message}`,
        );
      }
      throw error;
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(
    job: Job<NodeJobPayload> | undefined,
    error: Error,
  ): Promise<void> {
    if (!job?.data) {
      return;
    }
    if (job.opts.attempts && job.attemptsMade >= job.opts.attempts) {
      this.logger.error(
        `[video:submit] worker failed pipeline=${job.data.pipelineId} node=${job.data.nodeId}: ${error.message}`,
        error.stack,
      );
      await this.completion.failVideoNode(job.data, error, { stage: 'submit' });
    }
  }
}
