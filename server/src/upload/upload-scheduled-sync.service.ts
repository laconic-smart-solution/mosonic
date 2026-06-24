import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventsService } from '../events/events.service';
import { McpService } from '../mcp/mcp.service';
import { PostAnalyticsService } from '../post/post-analytics.service';
import {
  PlatformPostStatus,
  PostStatus,
} from '../post/schemas/post.schema';
import type { IPostRepository } from '../repositories/interfaces/post.repository.interface';
import type { PostRecord } from '../repositories/interfaces/post.repository.interface';
import type { ISyncLockRepository } from '../repositories/interfaces/sync-lock.repository.interface';
import type { IUploadRepository } from '../repositories/interfaces/upload.repository.interface';
import type { UploadRecord } from '../repositories/interfaces/upload.repository.interface';
import {
  POST_REPOSITORY,
  SYNC_LOCK_REPOSITORY,
  UPLOAD_REPOSITORY,
} from '../repositories/tokens';
import {
  UploadChannelStatus,
  UploadJobStatus,
  type UploadChannelEntry,
} from './schemas/upload.schema';
import { ZERNIO_SCHEDULED_SYNC_LOCK_ID } from './sync-lock.schema';
import {
  interpretZernioPostForSync,
  mapWithConcurrencyLimit,
  type SyncPostDecision,
} from './upload-scheduled-sync.helpers';
import {
  uploadChannels,
  withPostPlatformResults,
  withUploadChannels,
} from './upload-record.util';
import {
  buildUploadStatusSummary,
  recomputeUploadJobStatus,
} from './upload-status.util';

@Injectable()
export class UploadScheduledSyncService {
  private readonly logger = new Logger(UploadScheduledSyncService.name);

  constructor(
    private readonly config: ConfigService,
    @Inject(UPLOAD_REPOSITORY)
    private readonly uploads: IUploadRepository,
    @Inject(POST_REPOSITORY)
    private readonly posts: IPostRepository,
    @Inject(SYNC_LOCK_REPOSITORY)
    private readonly syncLocks: ISyncLockRepository,
    private readonly mcpService: McpService,
    private readonly events: EventsService,
    private readonly postAnalyticsService: PostAnalyticsService,
  ) {}

  /**
   * Reconciles scheduled `posts` rows against Zernio (webhook may be missed).
   *
   * **Multi-instance:** With `ZERNIO_SYNC_INSTANCE_ID` set, we take a short lease in
   * `sync_locks` so only one replica runs per window. With it unset, every API replica runs
   * the job—fine for single-node dev; in production prefer a dedicated worker or set the id.
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async syncScheduledPostsWithZernio(): Promise<void> {
    const enabledRaw = this.config
      .get<string>('ZERNIO_SCHEDULED_SYNC_ENABLED')
      ?.trim()
      .toLowerCase();
    if (enabledRaw === 'false' || enabledRaw === '0') return;

    const instanceId = this.config.get<string>('ZERNIO_SYNC_INSTANCE_ID')?.trim();
    if (instanceId) {
      const acquired = await this.tryAcquireSyncLock(instanceId);
      if (!acquired) return;
    }

    const concurrency = Math.max(
      1,
      Number(this.config.get('ZERNIO_SCHEDULED_SYNC_MCP_CONCURRENCY')) || 5,
    );

    const postIdsWithZernio: string[] = [];

    try {
      const docs = await this.posts.findScheduledWithZernioId();

      for (const p of docs) {
        const id = typeof p.zernioPostId === 'string' ? p.zernioPostId.trim() : '';
        if (id && !postIdsWithZernio.includes(id)) {
          postIdsWithZernio.push(id);
        }
      }
      if (postIdsWithZernio.length === 0) return;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`scheduled sync: post batch query failed: ${msg}`);
      return;
    }

    await mapWithConcurrencyLimit(postIdsWithZernio, concurrency, async (zPid) => {
      let parsed: unknown | null;
      try {
        parsed = await this.mcpService.getZernioPost(zPid);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `scheduled sync: getZernioPost ${zPid} threw (will retry next run): ${msg}`,
        );
        return;
      }

      const decision = interpretZernioPostForSync(parsed);

      try {
        const postRows = await this.posts.findAllByZernioPostId(zPid);
        for (const post of postRows) {
          await this.applyDecisionForPost(post, zPid, decision);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`scheduled sync: apply posts ${zPid} failed: ${msg}`);
      }
    });
  }

  private async tryAcquireSyncLock(instanceId: string): Promise<boolean> {
    const leaseMs =
      Number(this.config.get('ZERNIO_SCHEDULED_SYNC_LOCK_LEASE_MS')) || 300_000;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + leaseMs);

    if (
      await this.syncLocks.tryAcquire(
        ZERNIO_SCHEDULED_SYNC_LOCK_ID,
        instanceId,
        expiresAt,
      )
    ) {
      return true;
    }

    return this.syncLocks.stealExpired(
      ZERNIO_SCHEDULED_SYNC_LOCK_ID,
      instanceId,
      expiresAt,
      now,
    );
  }

  private rowKey(ch: UploadChannelEntry): string {
    return ch.channel.trim().toLowerCase();
  }

  private platformKeys(post: PostRecord): Set<string> {
    return new Set(
      (post.channels ?? []).map((c) => String(c).trim().toLowerCase()),
    );
  }

  private emitUpload(
    uploadId: string,
    event: string,
    body: Record<string, unknown>,
  ): void {
    this.events.emitToRoom(`upload_${uploadId}`, event, body);
  }

  private remainingScheduledHint(upload: UploadRecord): string | null {
    const remaining = uploadChannels(upload).find(
      (c) => c.status === UploadChannelStatus.Scheduled && c.scheduledAt,
    );
    if (!remaining?.scheduledAt) return null;
    const at =
      remaining.scheduledAt instanceof Date
        ? remaining.scheduledAt
        : new Date(remaining.scheduledAt as string);
    return at.toISOString();
  }

  private async saveUploadEmitAll(
    upload: UploadRecord,
    options: { publishNowHint?: boolean; scheduledAtHint?: string | null },
  ): Promise<void> {
    const channels = uploadChannels(upload);
    const saved = await this.uploads.save({
      ...withUploadChannels(upload, channels),
      status: recomputeUploadJobStatus(channels),
    });

    const status = saved.status;
    if (status === UploadJobStatus.Completed || status === UploadJobStatus.Partial) {
      const channelsPublished = uploadChannels(saved)
        .filter((c) => c.status === UploadChannelStatus.Published)
        .map((c) => c.channel.toLowerCase());
      this.emitUpload(saved.uploadId, 'upload:all_completed', {
        uploadId: saved.uploadId,
        publishNow: options.publishNowHint ?? true,
        scheduledAt: options.scheduledAtHint ?? null,
        channelsPublished,
        summary: buildUploadStatusSummary(uploadChannels(saved)),
      });
    }
  }

  private async applyDecisionForPost(
    post: PostRecord,
    zPid: string,
    decision: SyncPostDecision,
  ): Promise<void> {
    if (post.status !== PostStatus.Scheduled) return;
    if ((post.zernioPostId?.trim() ?? '') !== zPid) return;

    if (decision.kind === 'noop_scheduled') return;

    let publishNowHint = true;
    let scheduledAtHint: string | null = null;
    let uploadTouched = false;

    const keys = this.platformKeys(post);
    let nextPost = post;

    if (decision.kind === 'not_found') {
      nextPost = {
        ...post,
        status: PostStatus.Cancelled,
        failureReason: 'Post not found in Zernio.',
      };
      publishNowHint = false;
    } else if (decision.kind === 'mark_published') {
      nextPost = {
        ...withPostPlatformResults(
          post,
          [...keys].map((platform) => ({
            platform,
            status: PlatformPostStatus.Published,
            platformUrl: null,
            publishedAt: decision.at,
            failureReason: null,
          })),
        ),
        status: PostStatus.Published,
        publishedAt: decision.at,
        scheduledAt: null,
        failureReason: null,
        publishedNow: false,
      };
    } else if (decision.kind === 'mark_failed') {
      nextPost = {
        ...withPostPlatformResults(
          post,
          [...keys].map((platform) => ({
            platform,
            status: PlatformPostStatus.Failed,
            platformUrl: null,
            publishedAt: null,
            failureReason: decision.message,
          })),
        ),
        status: PostStatus.Failed,
        failureReason: decision.message,
      };
      publishNowHint = false;
    }

    const savedPost = await this.posts.save(nextPost);

    if (savedPost.status === PostStatus.Published) {
      await this.postAnalyticsService.ensureForPost(savedPost);
    }

    const upload = await this.uploads.findByUploadId(post.uploadRef);
    if (!upload) return;

    const channels = uploadChannels(upload);
    for (const ch of channels) {
      if (!keys.has(this.rowKey(ch))) continue;

      uploadTouched = true;

      if (decision.kind === 'not_found') {
        ch.status = UploadChannelStatus.Failed;
        ch.failureReason = 'Post not found in Zernio.';
        ch.scheduledAt = null;
        this.emitUpload(upload.uploadId, 'upload:failed', {
          uploadId: upload.uploadId,
          channel: this.rowKey(ch),
          message: 'Publishing failed. Please retry.',
        });
      } else if (decision.kind === 'mark_published') {
        ch.status = UploadChannelStatus.Published;
        ch.publishedAt = decision.at;
        ch.scheduledAt = null;
        ch.failureReason = null;
        this.emitUpload(upload.uploadId, 'upload:completed', {
          uploadId: upload.uploadId,
          channel: this.rowKey(ch),
          postId: zPid,
        });
      } else if (decision.kind === 'mark_failed') {
        ch.status = UploadChannelStatus.Failed;
        ch.failureReason = decision.message;
        this.emitUpload(upload.uploadId, 'upload:failed', {
          uploadId: upload.uploadId,
          channel: this.rowKey(ch),
          message: decision.message,
        });
      }
    }

    if (!uploadTouched) return;

    scheduledAtHint = this.remainingScheduledHint(withUploadChannels(upload, channels));

    await this.saveUploadEmitAll(withUploadChannels(upload, channels), {
      publishNowHint,
      scheduledAtHint,
    });
  }
}
