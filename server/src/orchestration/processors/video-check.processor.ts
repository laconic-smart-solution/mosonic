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
    const { pipelineId, nodeId, externalJobId, checkCount, normalized } =
      payload;

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
      );
      return;
    }

    let check;
    try {
      check = await this.videoService.checkVideoJob(
        externalJobId,
        normalized.provider,
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
      await this.completion.failVideoNode(
        payload,
        new Error(check.error ?? 'Video generation failed'),
      );
      return;
    }

    const input = await this.completion.buildVideoGenerationInput(payload);
    const completed = await this.videoService.completeVideoJob(externalJobId, {
      ...input,
      normalized,
    });

    await this.completion.completeVideoNode(payload, completed);
    this.logger.log(
      `[video:check] completed pipeline=${pipelineId} url=${completed.video}`,
    );
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
