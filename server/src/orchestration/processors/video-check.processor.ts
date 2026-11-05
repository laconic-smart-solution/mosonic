import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';
import {
  buildRedisConnectionOptions,
  redisEnvFromConfig,
} from '../../config/redis-connection.util';
import { VideoGenerationService } from '../../nodes/services/video-generation.service';
import { MediaNodeCompletionService } from '../media-node-completion.service';
import { allQueueNamesForBase } from '../queue-tenant.util';
import { TenantQueueService } from '../tenant-queue.service';
import {
  POLL_CONFIG,
  QUEUES,
  videoCheckJobId,
  videoPollIntervalMs,
  videoPollWallTimeoutMs,
} from '../types/queue.constants';
import type { MediaCheckJobPayload } from '../types/media-check-job.payload';

/**
 * Runs `video_check` jobs — see PipelineNodeProcessor's doc comment for why
 * this manages raw BullMQ Workers (one per tenant bucket) instead of using
 * the `@Processor` decorator.
 */
@Injectable()
export class VideoCheckProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VideoCheckProcessor.name);
  private workers: Worker<MediaCheckJobPayload>[] = [];

  constructor(
    private readonly videoService: VideoGenerationService,
    private readonly completion: MediaNodeCompletionService,
    private readonly tenantQueues: TenantQueueService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const connection = buildRedisConnectionOptions(
      redisEnvFromConfig(this.config),
    );
    const concurrency = Number(process.env.VIDEO_CHECK_CONCURRENCY ?? 10);
    const names = allQueueNamesForBase(QUEUES.VIDEO_CHECK);
    for (const name of names) {
      const worker = new Worker<MediaCheckJobPayload>(
        name,
        (job) => this.process(job),
        { connection, concurrency },
      );
      worker.on('failed', (job, error) => void this.onFailed(job, error));
      this.workers.push(worker);
    }
    this.logger.log(
      `${QUEUES.VIDEO_CHECK} worker started on ${names.length} queue(s): ${names.join(', ')}`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(this.workers.map((worker) => worker.close()));
  }

  private async process(job: Job<MediaCheckJobPayload>): Promise<void> {
    const payload = job.data;
    const {
      pipelineId,
      nodeId,
      externalJobId,
      checkCount,
      videoProvider = 'heygen',
    } = payload;

    this.logger.log(
      `[video:check] pipeline=${pipelineId} node=${nodeId} attempt=${checkCount}`,
    );

    const submittedAtMs = Date.parse(payload.submittedAt ?? '');
    const elapsedMs = Number.isFinite(submittedAtMs)
      ? Date.now() - submittedAtMs
      : 0;
    const wallTimeoutMs = videoPollWallTimeoutMs(videoProvider);
    const timedOutByChecks = checkCount >= POLL_CONFIG.video.maxChecks;
    const timedOutByWall =
      Number.isFinite(submittedAtMs) && elapsedMs >= wallTimeoutMs;

    if (timedOutByChecks || timedOutByWall) {
      this.logger.warn(
        `[video:check] timed out pipeline=${pipelineId} node=${nodeId} ` +
          `checks=${checkCount} elapsedMs=${elapsedMs} ` +
          `reason=${timedOutByWall ? 'wall_clock' : 'max_checks'}`,
      );
      await this.completion.failVideoNode(
        payload,
        new Error(POLL_CONFIG.video.timeoutLabel),
        { videoProvider, stage: 'timeout' },
      );
      return;
    }

    if (videoProvider !== 'heygen') {
      await this.completion.failVideoNode(
        payload,
        new Error(
          'Sora video provider is retired; re-run this node with HeyGen (video_cinematic / video_presenter).',
        ),
        { videoProvider, stage: 'poll' },
      );
      return;
    }

    let check;
    try {
      check = await this.videoService.checkHeyGenVideoJob(externalJobId);
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
      const failError = new Error(check.error ?? 'Video generation failed');
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
      const completed = await this.videoService.completeHeyGenVideoJob(
        externalJobId,
        input,
      );

      await this.completion.completeVideoNode(payload, completed);
      this.logger.log(
        `[video:check] completed pipeline=${pipelineId} url=${completed.video}`,
      );
    } catch (err) {
      const error =
        err instanceof Error
          ? err
          : new Error(String(err ?? 'Complete failed'));
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

  private async scheduleNextCheck(
    payload: MediaCheckJobPayload,
  ): Promise<void> {
    const nextCount = payload.checkCount + 1;
    const intervalMs = videoPollIntervalMs(payload.videoProvider ?? 'heygen');
    try {
      const videoCheckQueue = this.tenantQueues.forUser<MediaCheckJobPayload>(
        QUEUES.VIDEO_CHECK,
        payload.userId,
      );
      await videoCheckQueue.add(
        'video_check',
        { ...payload, checkCount: nextCount },
        {
          jobId: videoCheckJobId(payload.pipelineId, payload.nodeId, nextCount),
          delay: intervalMs,
          attempts: 2,
        },
      );
    } catch (err) {
      this.logger.error(
        `[video:check] failed to schedule next poll pipeline=${payload.pipelineId} ` +
          `node=${payload.nodeId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }
  }

  private async onFailed(
    job: Job<MediaCheckJobPayload> | undefined,
    error: Error,
  ): Promise<void> {
    if (!job?.data) {
      return;
    }
    if (job.opts.attempts && job.attemptsMade >= job.opts.attempts) {
      this.logger.warn(
        `[video:check] job exhausted attempts pipeline=${job.data.pipelineId} ` +
          `node=${job.data.nodeId} check=${job.data.checkCount}: ${error.message}`,
      );
      try {
        await this.scheduleNextCheck(job.data);
      } catch (err) {
        this.logger.error(
          `[video:check] recovery schedule failed pipeline=${job.data.pipelineId}: ` +
            `${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }
}
