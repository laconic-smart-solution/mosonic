import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, type PipelineStage } from 'mongoose';
import type { TenancyAuth } from '../auth/tenancy.types';
import { mergeUserIdFilter } from '../auth/tenancy.util';
import { aggregateMetrics } from '../analytics/analytics-metrics.util';
import type { ContentPerformanceEntry } from '../analytics/schemas/analytics.schema';
import { PostAnalyticsService } from '../post/post-analytics.service';
import { Content, ContentStatus, type ContentDocument } from '../content/schemas/content.schema';
import {
  Upload,
  UploadChannelStatus,
  type UploadDocument,
} from '../upload/schemas/upload.schema';
import type {
  DashboardRecentActivityDto,
  DashboardResponseDto,
  DashboardUpcomingScheduledItemDto,
  DashboardWeeklyPerformanceDto,
} from './dto/dashboard-response.dto';

type DateRange = { from: Date; to: Date };

function monthRange(now: Date): DateRange {
  const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
  return { from, to };
}

function safeIso(d: unknown): string | null {
  if (d instanceof Date && !Number.isNaN(d.getTime())) return d.toISOString();
  return null;
}

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(Content.name)
    private readonly contentModel: Model<ContentDocument>,
    @InjectModel(Upload.name)
    private readonly uploadModel: Model<UploadDocument>,
    private readonly postAnalyticsService: PostAnalyticsService,
  ) {}

  async getDashboard(auth: TenancyAuth): Promise<DashboardResponseDto> {
    const now = new Date();
    const { from: monthFrom, to: monthTo } = monthRange(now);

    const [
      pendingReviewCount,
      postsPublishedThisMonth,
      scheduledPostsCount,
      failedPostsCount,
      upcomingScheduled,
      pendingSuggestionsCount,
      weeklyPerformance,
      recentActivity,
    ] = await Promise.all([
      this.countDraftContent(auth),
      this.countPublishedChannelsInRange(auth, monthFrom, monthTo),
      this.countScheduledChannelsFromNow(auth, now),
      this.countFailedChannels(auth),
      this.listUpcomingScheduled(auth, now, 5),
      Promise.resolve(0),
      this.computeWeeklyPerformance(auth),
      this.buildRecentActivity(auth, now, 10),
    ]);

    return {
      stats: {
        postsPublishedThisMonth,
        pendingReviewCount,
        scheduledPostsCount,
        totalReachThisWeek: weeklyPerformance.reach,
      },
      actionItems: {
        pendingContentCount: pendingReviewCount,
        pendingSuggestionsCount,
        failedPostsCount,
      },
      upcomingScheduled,
      weeklyPerformance,
      recentActivity,
    };
  }

  private async countDraftContent(auth: TenancyAuth): Promise<number> {
    const filter = mergeUserIdFilter({ status: ContentStatus.Draft }, auth);
    return this.contentModel.countDocuments(filter).exec();
  }

  private async countFailedChannels(auth: TenancyAuth): Promise<number> {
    const filter = mergeUserIdFilter(
      { channels: { $elemMatch: { status: UploadChannelStatus.Failed } } },
      auth,
    );
    const pipeline: PipelineStage[] = [
      { $match: filter },
      { $unwind: '$channels' },
      { $match: { 'channels.status': UploadChannelStatus.Failed } },
      { $count: 'n' },
    ];
    const res = await this.uploadModel.aggregate(pipeline).exec();
    return typeof res?.[0]?.n === 'number' ? res[0].n : 0;
  }

  private async countPublishedChannelsInRange(
    auth: TenancyAuth,
    from: Date,
    to: Date,
  ): Promise<number> {
    const filter = mergeUserIdFilter(
      {
        channels: {
          $elemMatch: {
            status: UploadChannelStatus.Published,
            publishedAt: { $gte: from, $lt: to },
          },
        },
      },
      auth,
    );
    const pipeline: PipelineStage[] = [
      { $match: filter },
      { $unwind: '$channels' },
      {
        $match: {
          'channels.status': UploadChannelStatus.Published,
          'channels.publishedAt': { $gte: from, $lt: to },
        },
      },
      { $count: 'n' },
    ];
    const res = await this.uploadModel.aggregate(pipeline).exec();
    return typeof res?.[0]?.n === 'number' ? res[0].n : 0;
  }

  private async countScheduledChannelsFromNow(
    auth: TenancyAuth,
    now: Date,
  ): Promise<number> {
    const filter = mergeUserIdFilter(
      {
        channels: {
          $elemMatch: {
            status: UploadChannelStatus.Scheduled,
            scheduledAt: { $gte: now },
          },
        },
      },
      auth,
    );
    const pipeline: PipelineStage[] = [
      { $match: filter },
      { $unwind: '$channels' },
      {
        $match: {
          'channels.status': UploadChannelStatus.Scheduled,
          'channels.scheduledAt': { $gte: now },
        },
      },
      { $count: 'n' },
    ];
    const res = await this.uploadModel.aggregate(pipeline).exec();
    return typeof res?.[0]?.n === 'number' ? res[0].n : 0;
  }

  private async listUpcomingScheduled(
    auth: TenancyAuth,
    now: Date,
    limit: number,
  ): Promise<DashboardUpcomingScheduledItemDto[]> {
    const filter = mergeUserIdFilter(
      {
        channels: {
          $elemMatch: {
            status: UploadChannelStatus.Scheduled,
            scheduledAt: { $gte: now },
          },
        },
      },
      auth,
    );
    const pipeline: PipelineStage[] = [
      { $match: filter },
      { $unwind: '$channels' },
      {
        $match: {
          'channels.status': UploadChannelStatus.Scheduled,
          'channels.scheduledAt': { $gte: now },
        },
      },
      { $sort: { 'channels.scheduledAt': 1 } },
      { $limit: limit },
      {
        $project: {
          _id: 0,
          uploadId: 1,
          contentRef: 1,
          ruleRef: 1,
          channel: '$channels.channel',
          caption: '$channels.caption',
          scheduledAt: '$channels.scheduledAt',
        },
      },
    ];
    const rows = (await this.uploadModel.aggregate(pipeline).exec()) as Array<{
      uploadId?: string;
      contentRef?: string;
      ruleRef?: string;
      channel?: string;
      caption?: string;
      scheduledAt?: Date;
    }>;
    return rows
      .map((r) => ({
        uploadId: r.uploadId ?? '',
        contentRef: r.contentRef ?? '',
        ruleRef: r.ruleRef ?? '',
        channel: r.channel ?? '',
        caption: (r.caption ?? '').toString(),
        scheduledAt: safeIso(r.scheduledAt) ?? now.toISOString(),
      }))
      .filter((r) => r.uploadId && r.contentRef && r.channel);
  }

  private async computeWeeklyPerformance(
    auth: TenancyAuth,
  ): Promise<DashboardWeeklyPerformanceDto> {
    const rows = await this.postAnalyticsService.aggregateMetricsForAuth(auth);
    const entries: ContentPerformanceEntry[] = rows.map((row) => ({
      contentRef: row.contentRef,
      pipelineRef: '',
      uploadRef: '',
      zernioPostId: '',
      channel: row.platform,
      metrics: row.metrics,
    }));
    const summary = aggregateMetrics(entries);

    let bestContentLabel = summary.bestPerformingContent;
    if (summary.bestPerformingContent) {
      const content = await this.contentModel
        .findOne(
          mergeUserIdFilter(
            { contentId: summary.bestPerformingContent },
            auth,
          ),
        )
        .select({ outputs: 1, userEdits: 1 })
        .lean()
        .exec();
      const c = content as
        | { outputs?: { text?: string }; userEdits?: { text?: string } }
        | null;
      const text = (c?.userEdits?.text ?? c?.outputs?.text ?? '').trim();
      if (text) {
        bestContentLabel =
          text.length > 48 ? `${text.slice(0, 48).trim()}…` : text;
      }
    }

    return {
      reach: summary.totalReach,
      likes: summary.totalLikes,
      comments: summary.totalComments,
      clicks: summary.totalClicks,
      bestChannel: summary.bestPerformingChannel,
      bestContent: bestContentLabel,
    };
  }

  private async buildRecentActivity(
    auth: TenancyAuth,
    now: Date,
    limit: number,
  ): Promise<DashboardRecentActivityDto[]> {
    const [recentContents, recentUploadEvents] = await Promise.all([
      this.contentModel
        .find(mergeUserIdFilter({}, auth))
        .sort({ updatedAt: -1 })
        .limit(10)
        .select({ contentId: 1, status: 1, updatedAt: 1 })
        .lean()
        .exec(),
      this.listRecentUploadChannelEvents(auth, 15),
    ]);

    const contentEvents: DashboardRecentActivityDto[] = (recentContents as Array<{
      contentId: string;
      status: ContentStatus;
      updatedAt?: Date;
    }>).map((c) => {
      const at = safeIso(c.updatedAt) ?? now.toISOString();
      const status = c.status;
      if (status === ContentStatus.Approved) {
        return {
          kind: 'content_approved',
          label: 'Content approved',
          at,
          contentRef: c.contentId,
          status,
        };
      }
      if (status === ContentStatus.Rejected) {
        return {
          kind: 'content_rejected',
          label: 'Content rejected',
          at,
          contentRef: c.contentId,
          status,
        };
      }
      return {
        kind: 'content_draft_updated',
        label: 'Draft updated',
        at,
        contentRef: c.contentId,
        status,
      };
    });

    const merged = [...contentEvents, ...recentUploadEvents].sort(
      (a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0),
    );
    return merged.slice(0, limit);
  }

  private async listRecentUploadChannelEvents(
    auth: TenancyAuth,
    limit: number,
  ): Promise<DashboardRecentActivityDto[]> {
    const filter = mergeUserIdFilter(
      {
        channels: {
          $elemMatch: {
            status: {
              $in: [
                UploadChannelStatus.Published,
                UploadChannelStatus.Scheduled,
                UploadChannelStatus.Failed,
              ],
            },
          },
        },
      },
      auth,
    );
    const pipeline: PipelineStage[] = [
      { $match: filter },
      { $unwind: '$channels' },
      {
        $match: {
          'channels.status': {
            $in: [
              UploadChannelStatus.Published,
              UploadChannelStatus.Scheduled,
              UploadChannelStatus.Failed,
            ],
          },
        },
      },
      {
        $addFields: {
          eventAt: {
            $ifNull: [
              '$channels.publishedAt',
              { $ifNull: ['$channels.scheduledAt', '$updatedAt'] },
            ],
          },
        },
      },
      { $sort: { eventAt: -1 } },
      { $limit: limit },
      {
        $project: {
          _id: 0,
          uploadId: 1,
          contentRef: 1,
          channel: '$channels.channel',
          status: '$channels.status',
          scheduledAt: '$channels.scheduledAt',
          publishedAt: '$channels.publishedAt',
          eventAt: 1,
        },
      },
    ];
    const rows = (await this.uploadModel.aggregate(pipeline).exec()) as Array<{
      uploadId?: string;
      contentRef?: string;
      channel?: string;
      status?: UploadChannelStatus;
      eventAt?: Date;
    }>;
    return rows
      .map((r) => {
        const at = safeIso(r.eventAt) ?? new Date().toISOString();
        const channel = r.channel ?? '';
        const uploadId = r.uploadId ?? undefined;
        const contentRef = r.contentRef ?? undefined;
        if (r.status === UploadChannelStatus.Published) {
          return {
            kind: 'upload_published',
            label: channel ? `Published to ${channel}` : 'Published',
            at,
            channel,
            uploadId,
            contentRef,
          } satisfies DashboardRecentActivityDto;
        }
        if (r.status === UploadChannelStatus.Failed) {
          return {
            kind: 'upload_failed',
            label: channel ? `Failed to publish on ${channel}` : 'Publish failed',
            at,
            channel,
            uploadId,
            contentRef,
          } satisfies DashboardRecentActivityDto;
        }
        return {
          kind: 'upload_scheduled',
          label: channel ? `Scheduled for ${channel}` : 'Scheduled',
          at,
          channel,
          uploadId,
          contentRef,
        } satisfies DashboardRecentActivityDto;
      })
      .filter((e) => Boolean(e.uploadId) && Boolean(e.contentRef));
  }
}

