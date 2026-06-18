import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EventsService } from '../events/events.service';
import { McpService } from '../mcp/mcp.service';
import { PostAnalyticsService } from '../post/post-analytics.service';
import {
  PlatformPostStatus,
  Post,
  PostStatus,
  type PostDocument,
} from '../post/schemas/post.schema';
import {
  SyncLock,
  SyncLockDocument,
  ZERNIO_SCHEDULED_SYNC_LOCK_ID,
} from './sync-lock.schema';
import {
  Upload,
  UploadChannelStatus,
  UploadJobStatus,
  type UploadChannelEntry,
  type UploadDocument,
} from './schemas/upload.schema';
import {
  interpretZernioPostForSync,
  mapWithConcurrencyLimit,
  type SyncPostDecision,
} from './upload-scheduled-sync.helpers';
import {
  buildUploadStatusSummary,
  recomputeUploadJobStatus,
} from './upload-status.util';

@Injectable()
export class UploadScheduledSyncService {
  private readonly logger = new Logger(UploadScheduledSyncService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectModel(Upload.name)
    private readonly uploadModel: Model<UploadDocument>,
    @InjectModel(Post.name)
    private readonly postModel: Model<PostDocument>,
    @InjectModel(SyncLock.name)
    private readonly syncLockModel: Model<SyncLockDocument>,
    private readonly mcpService: McpService,
    private readonly events: EventsService,
    private readonly postAnalyticsService: PostAnalyticsService,
  ) {}

  /**
   * Reconciles scheduled `posts` rows against Zernio (webhook may be missed).
   *
   * **Multi-instance:** With `ZERNIO_SYNC_INSTANCE_ID` set, we take a short Mongo lease in
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
      const docs = await this.postModel
        .find({
          status: PostStatus.Scheduled,
          zernioPostId: { $exists: true, $nin: [null, ''] },
        })
        .select({ zernioPostId: 1 })
        .lean()
        .exec();

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
        const posts = await this.postModel.find({ zernioPostId: zPid }).exec();
        for (const post of posts) {
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

    const upserted = await this.syncLockModel
      .updateOne(
        { _id: ZERNIO_SCHEDULED_SYNC_LOCK_ID },
        { $setOnInsert: { owner: instanceId, expiresAt } },
        { upsert: true },
      )
      .exec();
    if (upserted.upsertedCount > 0) return true;

    const stolen = await this.syncLockModel
      .updateOne(
        { _id: ZERNIO_SCHEDULED_SYNC_LOCK_ID, expiresAt: { $lte: now } },
        { $set: { owner: instanceId, expiresAt } },
      )
      .exec();
    return stolen.modifiedCount > 0;
  }

  private rowKey(ch: UploadChannelEntry): string {
    return ch.channel.trim().toLowerCase();
  }

  private platformKeys(postDoc: PostDocument): Set<string> {
    return new Set(
      (postDoc.channels ?? []).map((c) => String(c).trim().toLowerCase()),
    );
  }

  private emitUpload(
    uploadId: string,
    event: string,
    body: Record<string, unknown>,
  ): void {
    this.events.emitToRoom(`upload_${uploadId}`, event, body);
  }

  private remainingScheduledHint(doc: UploadDocument): string | null {
    const remaining = doc.channels.find(
      (c) => c.status === UploadChannelStatus.Scheduled && c.scheduledAt,
    );
    return remaining?.scheduledAt ? remaining.scheduledAt.toISOString() : null;
  }

  private async saveUploadEmitAll(
    doc: UploadDocument,
    options: { publishNowHint?: boolean; scheduledAtHint?: string | null },
  ): Promise<void> {
    doc.status = recomputeUploadJobStatus(doc.channels);
    await doc.save();

    const status = doc.status;
    if (status === UploadJobStatus.Completed || status === UploadJobStatus.Partial) {
      const channelsPublished = doc.channels
        .filter((c) => c.status === UploadChannelStatus.Published)
        .map((c) => c.channel.toLowerCase());
      this.emitUpload(doc.uploadId, 'upload:all_completed', {
        uploadId: doc.uploadId,
        publishNow: options.publishNowHint ?? true,
        scheduledAt: options.scheduledAtHint ?? null,
        channelsPublished,
        summary: buildUploadStatusSummary(doc.channels),
      });
    }
  }

  private async applyDecisionForPost(
    post: PostDocument,
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

    if (decision.kind === 'not_found') {
      post.status = PostStatus.Cancelled;
      post.failureReason = 'Post not found in Zernio.';
      publishNowHint = false;
    } else if (decision.kind === 'mark_published') {
      post.status = PostStatus.Published;
      post.publishedAt = decision.at;
      post.scheduledAt = null;
      post.failureReason = null;
      post.publishedNow = false;
      post.platformResults = [...keys].map((platform) => ({
        platform,
        status: PlatformPostStatus.Published,
        platformUrl: null,
        publishedAt: decision.at,
        failureReason: null,
      }));
    } else if (decision.kind === 'mark_failed') {
      post.status = PostStatus.Failed;
      post.failureReason = decision.message;
      publishNowHint = false;
      post.platformResults = [...keys].map((platform) => ({
        platform,
        status: PlatformPostStatus.Failed,
        platformUrl: null,
        publishedAt: null,
        failureReason: decision.message,
      }));
    }

    await post.save();

    if (post.status === PostStatus.Published) {
      await this.postAnalyticsService.ensureForPost(post);
    }

    const doc = await this.uploadModel.findOne({ uploadId: post.uploadRef }).exec();
    if (!doc) return;

    for (const ch of doc.channels) {
      if (!keys.has(this.rowKey(ch))) continue;

      uploadTouched = true;

      if (decision.kind === 'not_found') {
        ch.status = UploadChannelStatus.Failed;
        ch.failureReason = 'Post not found in Zernio.';
        ch.scheduledAt = null;
        this.emitUpload(doc.uploadId, 'upload:failed', {
          uploadId: doc.uploadId,
          channel: this.rowKey(ch),
          message: 'Publishing failed. Please retry.',
        });
      } else if (decision.kind === 'mark_published') {
        ch.status = UploadChannelStatus.Published;
        ch.publishedAt = decision.at;
        ch.scheduledAt = null;
        ch.failureReason = null;
        this.emitUpload(doc.uploadId, 'upload:completed', {
          uploadId: doc.uploadId,
          channel: this.rowKey(ch),
          postId: zPid,
        });
      } else if (decision.kind === 'mark_failed') {
        ch.status = UploadChannelStatus.Failed;
        ch.failureReason = decision.message;
        this.emitUpload(doc.uploadId, 'upload:failed', {
          uploadId: doc.uploadId,
          channel: this.rowKey(ch),
          message: decision.message,
        });
      }
    }

    if (!uploadTouched) return;

    scheduledAtHint = this.remainingScheduledHint(doc);

    doc.markModified('channels');
    await this.saveUploadEmitAll(doc, {
      publishNowHint,
      scheduledAtHint,
    });
  }
}
