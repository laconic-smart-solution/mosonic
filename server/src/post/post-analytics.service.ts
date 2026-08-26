import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import type { Prisma } from '@prisma/client';
import type { TenancyAuth } from '../auth/tenancy.types';
import { mergeTenancyWhere } from '../repositories/prisma/prisma.util';
import { extractPostAnalyticsRows } from '../analytics/analytics-metrics.util';
import { ZernioRestClient } from '../mcp/zernio/zernio-rest.client';
import { ANALYTICS_WEEKLY_PULL_LOCK_ID } from '../analytics/analytics-sync.constants';
import type { IPostAnalyticsRepository } from '../repositories/interfaces/post-analytics.repository.interface';
import type { PostAnalyticsRecord } from '../repositories/interfaces/post-analytics.repository.interface';
import type { IPostRepository } from '../repositories/interfaces/post.repository.interface';
import type { PostRecord } from '../repositories/interfaces/post.repository.interface';
import type { ISyncLockRepository } from '../repositories/interfaces/sync-lock.repository.interface';
import {
  POST_ANALYTICS_REPOSITORY,
  POST_REPOSITORY,
  SYNC_LOCK_REPOSITORY,
} from '../repositories/tokens';
import { postPlatformResults } from '../upload/upload-record.util';
import {
  isPostMetricsEligible,
  publishedChannelsFromPost,
  supportsAnalyticsChannel,
} from './post-analytics.util';
import { isZernioRemotePostId } from './is-zernio-remote-post-id.util';
import { PostStatus } from './schemas/post.schema';
import {
  PlatformMetricSyncStatus,
  PostAnalyticsSyncStatus,
  type PlatformMetricEntry,
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

function periodBounds(period: unknown): { from: Date; to: Date } {
  const p = (period ?? {}) as { from?: unknown; to?: unknown };
  const from =
    p.from instanceof Date
      ? p.from
      : new Date(typeof p.from === 'string' ? p.from : Date.now());
  const to =
    p.to instanceof Date
      ? p.to
      : new Date(typeof p.to === 'string' ? p.to : Date.now());
  return { from, to };
}

@Injectable()
export class PostAnalyticsService {
  private readonly logger = new Logger(PostAnalyticsService.name);

  constructor(
    private readonly config: ConfigService,
    @Inject(POST_ANALYTICS_REPOSITORY)
    private readonly postAnalytics: IPostAnalyticsRepository,
    @Inject(POST_REPOSITORY)
    private readonly posts: IPostRepository,
    @Inject(SYNC_LOCK_REPOSITORY)
    private readonly syncLocks: ISyncLockRepository,
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

  toDto(doc: PostAnalyticsRecord): PostAnalyticsDto {
    const { from, to } = periodBounds(doc.period);
    const platformMetrics = Array.isArray(doc.platformMetrics)
      ? (doc.platformMetrics as unknown as PlatformMetricEntry[])
      : [];
    return {
      postId: doc.postId,
      zernioPostId: doc.zernioPostId,
      syncStatus: doc.syncStatus,
      pulledAt: doc.pulledAt.toISOString(),
      period: {
        from: from.toISOString(),
        to: to.toISOString(),
      },
      platformMetrics: platformMetrics.map((row) => ({
        platform: row.platform,
        metrics: row.metrics,
        syncStatus: row.syncStatus,
        platformPostUrl: row.platformPostUrl ?? null,
        errorMessage: row.errorMessage ?? null,
      })),
    };
  }

  async findByPostId(postId: string): Promise<PostAnalyticsRecord | null> {
    return this.postAnalytics.findByPostId(postId);
  }

  async ensureForPost(post: PostRecord): Promise<PostAnalyticsRecord | null> {
    if (!isPostMetricsEligible(post.status)) {
      return null;
    }
    const zernioPostId = post.zernioPostId?.trim();
    if (!zernioPostId || !isZernioRemotePostId(zernioPostId)) {
      return null;
    }

    const existing = await this.postAnalytics.findByPostId(post.postId);
    if (existing) {
      return existing;
    }

    const { from, to } = this.defaultPeriod();
    const now = new Date();
    return this.postAnalytics.create({
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

  private platformUrlFromRaw(raw: unknown, platform: string): string | null {
    if (!raw || typeof raw !== 'object') return null;
    const root = raw as Record<string, unknown>;
    const platformAnalytics = Array.isArray(root.platformAnalytics)
      ? root.platformAnalytics
      : [];
    const key = platform.trim().toLowerCase();
    for (const item of platformAnalytics) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      if (
        String(row.platform ?? '')
          .trim()
          .toLowerCase() !== key
      )
        continue;
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
    const post = await this.posts.findByPostId(postId, auth);
    if (!post) {
      throw new NotFoundException(`Post ${postId} not found`);
    }
    if (!isPostMetricsEligible(post.status)) {
      throw new BadRequestException(
        'Analytics are only available for published or partial posts.',
      );
    }

    const zernioPostId = post.zernioPostId?.trim();
    if (!zernioPostId || !isZernioRemotePostId(zernioPostId)) {
      const looksLikeRedNote =
        /^rednote:/i.test(zernioPostId ?? '') ||
        /xiaohongshu|rednote\.com/i.test(zernioPostId ?? '') ||
        (post.channels ?? []).some((c) => c.trim().toLowerCase() === 'rednote');
      throw new BadRequestException(
        looksLikeRedNote
          ? 'RedNote does not support analytics.'
          : 'Post has no Zernio id.',
      );
    }

    await this.ensureForPost(post);

    const channels = publishedChannelsFromPost({
      status: post.status,
      platformResults: postPlatformResults(post),
      channels: post.channels,
    });
    if (channels.length === 0) {
      throw new BadRequestException(
        'No analytics-supported channels on this post. RedNote does not support analytics.',
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

    const updated = await this.postAnalytics.upsertSyncResult(postId, {
      zernioPostId,
      ruleRef: post.ruleRef,
      userId: post.userId,
      syncStatus,
      pulledAt,
      period: { from, to },
      platformMetrics: platformMetrics as unknown as Prisma.InputJsonValue,
    });

    return this.toDto(updated);
  }

  private emptyPlatformMetrics(
    channels: string[],
  ): PostAnalyticsDto['platformMetrics'] {
    return channels.map((platform) => ({
      platform,
      metrics: null,
      syncStatus: PlatformMetricSyncStatus.Pending,
      platformPostUrl: null,
      errorMessage: null,
    }));
  }

  async getDtoForPost(post: PostRecord): Promise<PostAnalyticsDto | null> {
    if (!isPostMetricsEligible(post.status)) {
      return null;
    }
    const channels = publishedChannelsFromPost({
      status: post.status,
      platformResults: postPlatformResults(post),
      channels: post.channels,
    });
    const zernioPostId = post.zernioPostId?.trim() ?? '';
    if (
      !zernioPostId ||
      !isZernioRemotePostId(zernioPostId) ||
      channels.length === 0
    ) {
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
    const { rows: posts } = await this.posts.findPage(
      {
        ruleRef,
        status: { in: [PostStatus.Published, PostStatus.Partial] },
      },
      1,
      50_000,
      'createdAt',
      'desc',
    );

    if (!posts.length) return [];

    const postIds = posts.map((p) => p.postId);
    const analyticsDocs = await this.postAnalytics.findByPostIds(postIds);

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
      const platformMetrics = Array.isArray(doc.platformMetrics)
        ? (doc.platformMetrics as unknown as PlatformMetricEntry[])
        : [];
      for (const row of platformMetrics) {
        if (
          row.syncStatus === PlatformMetricSyncStatus.Synced &&
          row.metrics &&
          supportsAnalyticsChannel(row.platform)
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
    const { rows: posts } = await this.posts.findPage(
      mergeTenancyWhere(
        {
          status: { in: [PostStatus.Published, PostStatus.Partial] },
        },
        auth,
      ),
      1,
      50_000,
      'createdAt',
      'desc',
    );

    if (!posts.length) return [];

    const postIds = posts.map((p) => p.postId);
    const analyticsDocs = await this.postAnalytics.findByPostIds(postIds);

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
      const platformMetrics = Array.isArray(doc.platformMetrics)
        ? (doc.platformMetrics as unknown as PlatformMetricEntry[])
        : [];
      for (const row of platformMetrics) {
        if (
          row.syncStatus === PlatformMetricSyncStatus.Synced &&
          row.metrics &&
          supportsAnalyticsChannel(row.platform)
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
      Number(this.config.get('ANALYTICS_WEEKLY_PULL_LOCK_LEASE_MS')) || 600_000;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + leaseMs);

    if (
      await this.syncLocks.tryAcquire(
        ANALYTICS_WEEKLY_PULL_LOCK_ID,
        instanceId,
        expiresAt,
      )
    ) {
      return true;
    }

    return this.syncLocks.stealExpired(
      ANALYTICS_WEEKLY_PULL_LOCK_ID,
      instanceId,
      expiresAt,
      now,
    );
  }

  private async releaseWeeklyLock(): Promise<void> {
    await this.syncLocks.release(ANALYTICS_WEEKLY_PULL_LOCK_ID);
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
      const { rows: posts } = await this.posts.findPage(
        {
          status: { in: [PostStatus.Published, PostStatus.Partial] },
          zernioPostId: { not: null },
        },
        1,
        50_000,
        'createdAt',
        'desc',
      );

      for (const post of posts) {
        if (!isZernioRemotePostId(post.zernioPostId)) {
          continue;
        }
        const channels = publishedChannelsFromPost({
          status: post.status,
          platformResults: postPlatformResults(post),
          channels: post.channels,
        });
        if (channels.length === 0) {
          continue;
        }
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
