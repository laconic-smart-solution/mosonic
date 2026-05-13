import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import type { Types } from 'mongoose';
import { Model } from 'mongoose';
import { EventsService } from '../events/events.service';
import { McpService } from '../mcp/mcp.service';
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
  accumulateScheduledZernioPostWork,
  interpretZernioPostForSync,
  mapWithConcurrencyLimit,
  type ScheduledLeanUpload,
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
    @InjectModel(SyncLock.name)
    private readonly syncLockModel: Model<SyncLockDocument>,
    private readonly mcpService: McpService,
    private readonly events: EventsService,
  ) {}

  /**
   * Reconciles `scheduled` channel rows against Zernio (webhook may be missed).
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

    const batchSize = Math.max(
      1,
      Number(this.config.get('ZERNIO_SCHEDULED_SYNC_UPLOAD_BATCH')) || 300,
    );
    const concurrency = Math.max(
      1,
      Number(this.config.get('ZERNIO_SCHEDULED_SYNC_MCP_CONCURRENCY')) || 5,
    );

    const postIdToUploadIds = new Map<string, Set<string>>();
    let lastId: Types.ObjectId | undefined;

    const baseFilter = {
      channels: {
        $elemMatch: {
          status: UploadChannelStatus.Scheduled,
          zernioPostId: { $exists: true, $nin: [null, ''] },
        },
      },
    } as const;

    try {
      for (;;) {
        const q: Record<string, unknown> = { ...baseFilter };
        if (lastId) q._id = { $gt: lastId };

        const batch = await this.uploadModel
          .find(q)
          .select({ uploadId: 1, channels: 1 })
          .sort({ _id: 1 })
          .limit(batchSize)
          .lean()
          .exec();

        if (batch.length === 0) break;

        for (const doc of batch) {
          accumulateScheduledZernioPostWork(postIdToUploadIds, {
            uploadId: String(doc.uploadId),
            channels: (doc.channels ?? []) as ScheduledLeanUpload['channels'],
          });
        }

        lastId = batch[batch.length - 1]._id as Types.ObjectId;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`scheduled sync: upload batch query failed: ${msg}`);
      return;
    }

    const postIds = Array.from(postIdToUploadIds.keys());
    if (postIds.length === 0) return;

    await mapWithConcurrencyLimit(postIds, concurrency, async (postId) => {
      let parsed: unknown | null;
      try {
        parsed = await this.mcpService.getZernioPost(postId);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `scheduled sync: getZernioPost ${postId} threw (will retry next run): ${msg}`,
        );
        return;
      }

      const decision = interpretZernioPostForSync(parsed);
      const uploadIds = postIdToUploadIds.get(postId);
      if (!uploadIds) return;

      for (const uploadId of uploadIds) {
        try {
          await this.applyDecisionForUpload(uploadId, postId, decision);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `scheduled sync: apply ${uploadId} post ${postId} failed: ${msg}`,
          );
        }
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

  private emitUpload(
    uploadId: string,
    event: string,
    body: Record<string, unknown>,
  ): void {
    this.events.emitToRoom(`upload_${uploadId}`, event, body);
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

  private async applyDecisionForUpload(
    uploadId: string,
    postId: string,
    decision: SyncPostDecision,
  ): Promise<void> {
    const doc = await this.uploadModel.findOne({ uploadId }).exec();
    if (!doc) return;

    if (decision.kind === 'noop_scheduled') return;

    let touched = false;
    let publishNowHint = true;
    let scheduledAtHint: string | null = null;

    for (const ch of doc.channels) {
      if (ch.status !== UploadChannelStatus.Scheduled) continue;
      if ((ch.zernioPostId?.trim() ?? '') !== postId) continue;

      touched = true;

      if (decision.kind === 'not_found') {
        ch.status = UploadChannelStatus.Failed;
        ch.failureReason = 'Post not found in Zernio.';
        this.emitUpload(doc.uploadId, 'upload:failed', {
          uploadId: doc.uploadId,
          channel: this.rowKey(ch),
          message: 'Publishing failed. Please retry.',
        });
        publishNowHint = false;
      } else if (decision.kind === 'mark_published') {
        ch.status = UploadChannelStatus.Published;
        ch.publishedAt = decision.at;
        ch.scheduledAt = null;
        ch.failureReason = null;
        ch.zernioPostId = postId;
        this.emitUpload(doc.uploadId, 'upload:completed', {
          uploadId: doc.uploadId,
          channel: this.rowKey(ch),
          postId,
        });
      } else if (decision.kind === 'mark_failed') {
        ch.status = UploadChannelStatus.Failed;
        ch.failureReason = decision.message;
        this.emitUpload(doc.uploadId, 'upload:failed', {
          uploadId: doc.uploadId,
          channel: this.rowKey(ch),
          message: decision.message,
        });
        publishNowHint = false;
      }
    }

    if (!touched) return;

    if (scheduledAtHint === null) {
      const remainingScheduled = doc.channels.find(
        (c) => c.status === UploadChannelStatus.Scheduled && c.scheduledAt,
      );
      scheduledAtHint = remainingScheduled?.scheduledAt
        ? remainingScheduled.scheduledAt.toISOString()
        : null;
    }

    doc.markModified('channels');
    await this.saveUploadEmitAll(doc, {
      publishNowHint,
      scheduledAtHint,
    });
  }
}
