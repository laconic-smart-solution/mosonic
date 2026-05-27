import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { VideoGenerationService } from '../../nodes/services/video-generation.service';
import { MediaNodeCompletionService } from '../media-node-completion.service';
import { POLL_CONFIG, QUEUES, videoCheckJobId } from '../types/queue.constants';
import type { MediaCheckJobPayload } from '../types/media-check-job.payload';

@Processor(QUEUES.VIDEO_CHECK, {
  concurrency: Number(process.env.VIDEO_CHECK_CONCURRENCY ?? 10),
})
export class VideoCheckProcessor extends WorkerHost {
  private readonly logger = new Logger(VideoCheckProcessor.name);

  constructor(
    private readonly videoService: VideoGenerationService,
    private readonly completion: MediaNodeCompletionService,
    @InjectQueue(QUEUES.VIDEO_CHECK)
    private readonly videoCheckQueue: Queue<MediaCheckJobPayload>,
  ) {
    super();
  }

  async process(job: Job<MediaCheckJobPayload>): Promise<void> {
    const payload = job.data;
    const {
      pipelineId,
      nodeId,
      externalJobId,
      checkCount,
      normalized,
      videoProvider = 'sora',
    } = payload;

    this.logger.log(
      `[video:check] pipeline=${pipelineId} node=${nodeId} attempt=${checkCount}`,
    );

    if (checkCount >= POLL_CONFIG.video.maxChecks) {
      this.logger.warn(
        `[video:check] timed out after ${checkCount} checks pipeline=${pipelineId}`,
      );
      await this.completion.failVideoNode(
        payload,
        new Error(POLL_CONFIG.video.timeoutLabel),
        { videoProvider, stage: 'timeout' },
      );
      return;
    }

    let check;
    try {
      check =
        videoProvider === 'heygen'
          ? await this.videoService.checkHeyGenVideoJob(externalJobId)
          : await this.videoService.checkVideoJob(
              externalJobId,
              normalized?.provider,
            );
    } catch (err) {
      this.logger.warn(
        `[video:check] poll error pipeline=${pipelineId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      await this.scheduleNextCheck(payload);
      return;
    }

    this.logger.log(`[video:check] status=${check.status}`);

    if (check.status === 'processing') {
      await this.videoService.emitProcessing(
        pipelineId,
        nodeId,
        `Video still generating... (check ${checkCount + 1})`,
      );
      await this.scheduleNextCheck(payload);
      return;
    }

    if (check.status === 'failed') {
      const failError = new Error(
        check.error ?? 'Video generation failed',
      );
      this.logger.error(
        `[video:check] provider reported failed pipeline=${pipelineId} node=${nodeId} provider=${videoProvider} message=${failError.message}`,
      );
      await this.completion.failVideoNode(payload, failError, {
        videoProvider,
        stage: 'poll',
      });
      return;
    }

    const input = await this.completion.buildVideoGenerationInput(payload);
    try {
      const completed =
        videoProvider === 'heygen'
          ? await this.videoService.completeHeyGenVideoJob(externalJobId, input)
          : await this.videoService.completeVideoJob(externalJobId, {
              ...input,
              normalized: normalized!,
            });

      await this.completion.completeVideoNode(payload, completed);
      this.logger.log(
        `[video:check] completed pipeline=${pipelineId} url=${completed.video}`,
      );
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error(String(err ?? 'Complete failed'));
      this.logger.error(
        `[video:check] completion error pipeline=${pipelineId} node=${nodeId} provider=${videoProvider}: ${error.message}`,
        error.stack,
      );
      await this.completion.failVideoNode(payload, error, {
        videoProvider,
        stage: 'complete',
      });
    }
  }

  private async scheduleNextCheck(payload: MediaCheckJobPayload): Promise<void> {
    const nextCount = payload.checkCount + 1;
    await this.videoCheckQueue.add(
      'video_check',
      { ...payload, checkCount: nextCount },
      {
        jobId: videoCheckJobId(
          payload.pipelineId,
          payload.nodeId,
          nextCount,
        ),
        delay: POLL_CONFIG.video.intervalMs,
        attempts: 1,
      },
    );
  }
}
