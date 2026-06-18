import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { TenancyAuth } from '../auth/tenancy.types';
import { mergeUserIdFilter } from '../auth/tenancy.util';
import { extractPostAnalyticsRows } from '../analytics/analytics-metrics.util';
import { ZernioRestClient } from '../mcp/zernio/zernio-rest.client';
import { SyncLock, type SyncLockDocument } from '../upload/sync-lock.schema';
import { ANALYTICS_WEEKLY_PULL_LOCK_ID } from '../analytics/analytics-sync.constants';
import {
  isPostMetricsEligible,
  publishedChannelsFromPost,
} from './post-analytics.util';
import {
  Post,
  PostStatus,
  type PostDocument,
} from './schemas/post.schema';
import {
  PlatformMetricSyncStatus,
  PostAnalytics,
  PostAnalyticsSyncStatus,
  type PlatformMetricEntry,
  type PostAnalyticsDocument,
} from './schemas/post-analytics.schema';

export type PostAnalyticsDto = {
  postId: string;
  zernioPostId: string;
  syncStatus: PostAnalyticsSyncStatus;
  pulledAt: string;
  period: { from: string; to: string };
  platformMetrics: Array<{
    platform: string;
    metrics: PlatformMetricEntry['metrics'];
    syncStatus: PlatformMetricSyncStatus;
    platformPostUrl: string | null;
    errorMessage: string | null;
  }>;
};

@Injectable()
export class PostAnalyticsService {
  private readonly logger = new Logger(PostAnalyticsService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectModel(PostAnalytics.name)
    private readonly postAnalyticsModel: Model<PostAnalyticsDocument>,
    @InjectModel(Post.name)
    private readonly postModel: Model<PostDocument>,
    @InjectModel(SyncLock.name)
    private readonly syncLockModel: Model<SyncLockDocument>,
    private readonly zernioRest: ZernioRestClient,
  ) {}

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private defaultPeriod(): { from: Date; to: Date } {
    const to = new Date();
    const from = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    return { from, to };
  }

  toDto(doc: PostAnalyticsDocument | Record<string, unknown>): PostAnalyticsDto {
    const d = doc as PostAnalyticsDocument;
    return {
      postId: d.postId,
      zernioPostId: d.zernioPostId,
      syncStatus: d.syncStatus,
      pulledAt: d.pulledAt.toISOString(),
      period: {
        from: d.period.from.toISOString(),
        to: d.period.to.toISOString(),
      },
      platformMetrics: (d.platformMetrics ?? []).map((row) => ({
        platform: row.platform,
        metrics: row.metrics,
        syncStatus: row.syncStatus,
        platformPostUrl: row.platformPostUrl ?? null,
        errorMessage: row.errorMessage ?? null,
      })),
    };
  }

  async findByPostId(postId: string): Promise<PostAnalyticsDocument | null> {
    return this.postAnalyticsModel.findOne({ postId }).exec();
  }

  async ensureForPost(post: PostDocument): Promise<PostAnalyticsDocument | null> {
    if (!isPostMetricsEligible(post.status)) {
      return null;
    }
    const zernioPostId = post.zernioPostId?.trim();
    if (!zernioPostId) {
      return null;
    }

    const existing = await this.postAnalyticsModel
      .findOne({ postId: post.postId })
      .exec();
    if (existing) {
      return existing;
    }

    const { from, to } = this.defaultPeriod();
    const now = new Date();
    return this.postAnalyticsModel.create({
      postId: post.postId,
      zernioPostId,
      ruleRef: post.ruleRef,
      userId: post.userId,
      syncStatus: PostAnalyticsSyncStatus.Pending,
      pulledAt: now,
      period: { from, to },
      platformMetrics: [],
    });
  }

  private platformUrlFromRaw(
    raw: unknown,
    platform: string,
  ): string | null {
    if (!raw || typeof raw !== 'object') return null;
    const root = raw as Record<string, unknown>;
    const platformAnalytics = Array.isArray(root.platformAnalytics)
      ? root.platformAnalytics
      : [];
    const key = platform.trim().toLowerCase();
    for (const item of platformAnalytics) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      if (String(row.platform ?? '').trim().toLowerCase() !== key) continue;
      const url = row.platformPostUrl;
      return typeof url === 'string' && url.trim() ? url.trim() : null;
    }
    return null;
  }

  private buildPlatformMetrics(
    raw: unknown,
    channels: string[],
  ): PlatformMetricEntry[] {
    const extracted = extractPostAnalyticsRows(raw, channels);
    const syncedMap = new Map(
      extracted.synced.map((row) => [row.channel, row.metrics]),
    );
    const pendingSet = new Set(extracted.pending);
    const failedSet = new Set(extracted.failed);

    return channels.map((platform) => {
      const key = platform.trim().toLowerCase();
      const platformPostUrl = this.platformUrlFromRaw(raw, key);
      if (syncedMap.has(key)) {
        return {
          platform: key,
          metrics: syncedMap.get(key)!,
          syncStatus: PlatformMetricSyncStatus.Synced,
          platformPostUrl,
          errorMessage: null,
        };
      }
      if (pendingSet.has(key)) {
        return {
          platform: key,
          metrics: null,
          syncStatus: PlatformMetricSyncStatus.Pending,
          platformPostUrl,
          errorMessage: null,
        };
      }
      if (failedSet.has(key)) {
        return {
          platform: key,
          metrics: null,
          syncStatus: PlatformMetricSyncStatus.Failed,
          platformPostUrl,
          errorMessage: 'Platform analytics unavailable',
        };
      }
      return {
        platform: key,
        metrics: null,
        syncStatus: PlatformMetricSyncStatus.Unavailable,
        platformPostUrl,
        errorMessage: null,
      };
    });
  }

  private resolveOverallSyncStatus(
    rows: PlatformMetricEntry[],
  ): PostAnalyticsSyncStatus {
    if (rows.length === 0) return PostAnalyticsSyncStatus.Pending;
    const synced = rows.filter(
      (r) => r.syncStatus === PlatformMetricSyncStatus.Synced,
    ).length;
    if (synced === rows.length) return PostAnalyticsSyncStatus.Synced;
    if (synced > 0) return PostAnalyticsSyncStatus.Partial;
    const allPending = rows.every(
      (r) => r.syncStatus === PlatformMetricSyncStatus.Pending,
    );
    if (allPending) return PostAnalyticsSyncStatus.Pending;
    return PostAnalyticsSyncStatus.Unavailable;
  }

  async syncFromZernio(
    postId: string,
    auth?: TenancyAuth,
  ): Promise<PostAnalyticsDto> {
    const filter = auth
      ? mergeUserIdFilter({ postId }, auth)
      : { postId };
    const post = await this.postModel.findOne(filter).exec();
    if (!post) {
      throw new NotFoundException(`Post ${postId} not found`);
    }
    if (!isPostMetricsEligible(post.status)) {
      throw new BadRequestException(
        'Analytics are only available for published or partial posts.',
      );
    }

    const zernioPostId = post.zernioPostId?.trim();
    if (!zernioPostId) {
      throw new BadRequestException('Post has no Zernio id.');
    }

    await this.ensureForPost(post);

    const channels = publishedChannelsFromPost(post);
    if (channels.length === 0) {
      throw new BadRequestException(
        'No published channels to sync analytics for.',
      );
    }

    const { from, to } = this.defaultPeriod();
    let raw: unknown | null;
    try {
      raw = await this.zernioRest.getPostAnalytics(zernioPostId, {
        fromDate: from.toISOString().slice(0, 10),
        toDate: to.toISOString().slice(0, 10),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to sync analytics for post ${postId}: ${msg}`);
      throw new BadRequestException(
        msg || 'Failed to sync analytics from Zernio.',
      );
    }

    const pulledAt = new Date();
    let platformMetrics: PlatformMetricEntry[];
    let syncStatus: PostAnalyticsSyncStatus;

    if (raw == null) {
      platformMetrics = channels.map((platform) => ({
        platform,
        metrics: null,
        syncStatus: PlatformMetricSyncStatus.Pending,
        platformPostUrl: null,
        errorMessage: null,
      }));
      syncStatus = PostAnalyticsSyncStatus.Pending;
    } else {
      platformMetrics = this.buildPlatformMetrics(raw, channels);
      syncStatus = this.resolveOverallSyncStatus(platformMetrics);
    }

    const updated = await this.postAnalyticsModel
      .findOneAndUpdate(
        { postId },
        {
          $set: {
            zernioPostId,
            ruleRef: post.ruleRef,
            userId: post.userId,
            syncStatus,
            pulledAt,
            period: { from, to },
            platformMetrics,
          },
        },
        { new: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException(`Analytics for post ${postId} not found`);
    }

    return this.toDto(updated);
  }

  private emptyPlatformMetrics(channels: string[]): PostAnalyticsDto['platformMetrics'] {
    return channels.map((platform) => ({
      platform,
      metrics: null,
      syncStatus: PlatformMetricSyncStatus.Pending,
      platformPostUrl: null,
      errorMessage: null,
    }));
  }

  async getDtoForPost(post: PostDocument): Promise<PostAnalyticsDto | null> {
    if (!isPostMetricsEligible(post.status)) {
      return null;
    }
    const channels = publishedChannelsFromPost(post);
    const zernioPostId = post.zernioPostId?.trim() ?? '';
    if (!zernioPostId || channels.length === 0) {
      return null;
    }

    const doc = await this.findByPostId(post.postId);
    if (!doc) {
      const { from, to } = this.defaultPeriod();
      const now = new Date();
      return {
        postId: post.postId,
        zernioPostId,
        syncStatus: PostAnalyticsSyncStatus.Pending,
        pulledAt: now.toISOString(),
        period: { from: from.toISOString(), to: to.toISOString() },
        platformMetrics: this.emptyPlatformMetrics(channels),
      };
    }

    const dto = this.toDto(doc);
    const existing = new Set(
      dto.platformMetrics.map((row) => row.platform.trim().toLowerCase()),
    );
    for (const platform of channels) {
      const key = platform.trim().toLowerCase();
      if (existing.has(key)) continue;
      dto.platformMetrics.push({
        platform: key,
        metrics: null,
        syncStatus: PlatformMetricSyncStatus.Pending,
        platformPostUrl: null,
        errorMessage: null,
      });
    }
    return dto;
  }

  async aggregateMetricsForRule(ruleRef: string): Promise<
    Array<{
      postId: string;
      platform: string;
      contentRef: string;
      metrics: NonNullable<PlatformMetricEntry['metrics']>;
    }>
  > {
    const posts = await this.postModel
      .find({
        ruleRef,
        status: { $in: [PostStatus.Published, PostStatus.Partial] },
      })
      .select({ postId: 1, contentRef: 1 })
      .lean()
      .exec();

    if (!posts.length) return [];

    const postIds = posts.map((p) => p.postId);
    const analyticsDocs = await this.postAnalyticsModel
      .find({ postId: { $in: postIds } })
      .lean()
      .exec();

    const contentByPostId = new Map(
      posts.map((p) => [p.postId, String(p.contentRef ?? '')]),
    );

    const out: Array<{
      postId: string;
      platform: string;
      contentRef: string;
      metrics: NonNullable<PlatformMetricEntry['metrics']>;
    }> = [];

    for (const doc of analyticsDocs) {
      const contentRef = contentByPostId.get(doc.postId) ?? '';
      for (const row of doc.platformMetrics ?? []) {
        if (
          row.syncStatus === PlatformMetricSyncStatus.Synced &&
          row.metrics
        ) {
          out.push({
            postId: doc.postId,
            platform: row.platform,
            contentRef,
            metrics: row.metrics,
          });
        }
      }
    }

    return out;
  }

  async aggregateMetricsForAuth(auth: TenancyAuth): Promise<
    Array<{
      postId: string;
      platform: string;
      contentRef: string;
      metrics: NonNullable<PlatformMetricEntry['metrics']>;
    }>
  > {
    const posts = await this.postModel
      .find(
        mergeUserIdFilter(
          {
            status: { $in: [PostStatus.Published, PostStatus.Partial] },
          },
          auth,
        ),
      )
      .select({ postId: 1, contentRef: 1 })
      .lean()
      .exec();

    if (!posts.length) return [];

    const postIds = posts.map((p) => p.postId);
    const analyticsDocs = await this.postAnalyticsModel
      .find({ postId: { $in: postIds } })
      .lean()
      .exec();

    const contentByPostId = new Map(
      posts.map((p) => [p.postId, String(p.contentRef ?? '')]),
    );

    const out: Array<{
      postId: string;
      platform: string;
      contentRef: string;
      metrics: NonNullable<PlatformMetricEntry['metrics']>;
    }> = [];

    for (const doc of analyticsDocs) {
      const contentRef = contentByPostId.get(doc.postId) ?? '';
      for (const row of doc.platformMetrics ?? []) {
        if (
          row.syncStatus === PlatformMetricSyncStatus.Synced &&
          row.metrics
        ) {
          out.push({
            postId: doc.postId,
            platform: row.platform,
            contentRef,
            metrics: row.metrics,
          });
        }
      }
    }

    return out;
  }

  private async tryAcquireWeeklyLock(instanceId: string): Promise<boolean> {
    const leaseMs =
      Number(this.config.get('ANALYTICS_WEEKLY_PULL_LOCK_LEASE_MS')) ||
      600_000;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + leaseMs);

    const upserted = await this.syncLockModel
      .updateOne(
        { _id: ANALYTICS_WEEKLY_PULL_LOCK_ID },
        { $setOnInsert: { owner: instanceId, expiresAt } },
        { upsert: true },
      )
      .exec();
    if (upserted.upsertedCount > 0) return true;

    const stolen = await this.syncLockModel
      .updateOne(
        { _id: ANALYTICS_WEEKLY_PULL_LOCK_ID, expiresAt: { $lte: now } },
        { $set: { owner: instanceId, expiresAt } },
      )
      .exec();
    return stolen.modifiedCount > 0;
  }

  private async releaseWeeklyLock(): Promise<void> {
    await this.syncLockModel
      .deleteOne({ _id: ANALYTICS_WEEKLY_PULL_LOCK_ID })
      .exec();
  }

  @Cron('0 0 * * 1')
  async weeklySyncAllEligiblePosts(): Promise<void> {
    this.logger.log('Starting weekly post analytics sync...');
    const instanceId =
      this.config.get<string>('HOSTNAME')?.trim() || `pid-${process.pid}`;
    const acquired = await this.tryAcquireWeeklyLock(instanceId);
    if (!acquired) {
      this.logger.log('Post analytics sync already running — skipping');
      return;
    }

    try {
      const posts = await this.postModel
        .find({
          status: { $in: [PostStatus.Published, PostStatus.Partial] },
          zernioPostId: { $exists: true, $nin: [null, ''] },
        })
        .select({ postId: 1 })
        .lean()
        .exec();

      for (const post of posts) {
        try {
          await this.syncFromZernio(post.postId);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `Weekly sync failed for post ${post.postId}: ${msg}`,
          );
        }
        await this.sleep(500);
      }
    } finally {
      await this.releaseWeeklyLock();
    }

    this.logger.log('Weekly post analytics sync complete.');
  }
}
