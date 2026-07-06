import { Inject, Injectable } from '@nestjs/common';
import type { TenancyAuth } from '../auth/tenancy.types';
import { aggregateMetrics } from '../analytics/analytics-metrics.util';
import type { ContentPerformanceEntry } from '../analytics/schemas/analytics.schema';
import { ContentStatus } from '../content/schemas/content.schema';
import { PostAnalyticsService } from '../post/post-analytics.service';
import type { IContentRepository } from '../repositories/interfaces/content.repository.interface';
import type { IUploadRepository } from '../repositories/interfaces/upload.repository.interface';
import type { UploadRecord } from '../repositories/interfaces/upload.repository.interface';
import {
  CONTENT_REPOSITORY,
  UPLOAD_REPOSITORY,
} from '../repositories/tokens';
import { UploadChannelStatus } from '../upload/schemas/upload.schema';
import { uploadChannels } from '../upload/upload-record.util';
import type {
  DashboardRecentActivityDto,
  DashboardResponseDto,
  DashboardUpcomingScheduledItemDto,
  DashboardWeeklyPerformanceDto,
} from './dto/dashboard-response.dto';

type DateRange = { from: Date; to: Date };

type FlatChannel = {
  uploadId: string;
  contentRef: string;
  ruleRef: string;
  channel: string;
  caption: string;
  status: UploadChannelStatus;
  scheduledAt: Date | null;
  publishedAt: Date | null;
  updatedAt: Date;
};

function monthRange(now: Date): DateRange {
  const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
  return { from, to };
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

function safeIso(d: unknown): string | null {
  const parsed = toDate(d);
  return parsed?.toISOString() ?? null;
}

function flattenChannels(uploads: UploadRecord[]): FlatChannel[] {
  const out: FlatChannel[] = [];
  for (const upload of uploads) {
    for (const ch of uploadChannels(upload)) {
      out.push({
        uploadId: upload.uploadId,
        contentRef: upload.contentRef,
        ruleRef: upload.ruleRef ?? '',
        channel: ch.channel,
        caption: (ch.caption ?? '').toString(),
        status: ch.status as UploadChannelStatus,
        scheduledAt: toDate(ch.scheduledAt),
        publishedAt: toDate(ch.publishedAt),
        updatedAt: toDate(upload.updatedAt) ?? new Date(),
      });
    }
  }
  return out;
}

@Injectable()
export class DashboardService {
  constructor(
    @Inject(CONTENT_REPOSITORY)
    private readonly contentRepository: IContentRepository,
    @Inject(UPLOAD_REPOSITORY)
    private readonly uploadRepository: IUploadRepository,
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
      this.contentRepository.countDrafts(auth),
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

  private async loadScopedChannels(auth: TenancyAuth): Promise<FlatChannel[]> {
    const uploads = await this.uploadRepository.findAllScoped(auth);
    return flattenChannels(uploads);
  }

  private async countFailedChannels(auth: TenancyAuth): Promise<number> {
    const channels = await this.loadScopedChannels(auth);
    return channels.filter((ch) => ch.status === UploadChannelStatus.Failed)
      .length;
  }

  private async countPublishedChannelsInRange(
    auth: TenancyAuth,
    from: Date,
    to: Date,
  ): Promise<number> {
    const channels = await this.loadScopedChannels(auth);
    return channels.filter(
      (ch) =>
        ch.status === UploadChannelStatus.Published &&
        ch.publishedAt != null &&
        ch.publishedAt >= from &&
        ch.publishedAt < to,
    ).length;
  }

  private async countScheduledChannelsFromNow(
    auth: TenancyAuth,
    now: Date,
  ): Promise<number> {
    const channels = await this.loadScopedChannels(auth);
    return channels.filter(
      (ch) =>
        ch.status === UploadChannelStatus.Scheduled &&
        ch.scheduledAt != null &&
        ch.scheduledAt >= now,
    ).length;
  }

  private async listUpcomingScheduled(
    auth: TenancyAuth,
    now: Date,
    limit: number,
  ): Promise<DashboardUpcomingScheduledItemDto[]> {
    const channels = (await this.loadScopedChannels(auth))
      .filter(
        (ch) =>
          ch.status === UploadChannelStatus.Scheduled &&
          ch.scheduledAt != null &&
          ch.scheduledAt >= now,
      )
      .sort(
        (a, b) =>
          (a.scheduledAt?.getTime() ?? 0) - (b.scheduledAt?.getTime() ?? 0),
      )
      .slice(0, limit);

    return channels
      .map((r) => ({
        uploadId: r.uploadId,
        contentRef: r.contentRef,
        ruleRef: r.ruleRef,
        channel: r.channel,
        caption: r.caption,
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
      const content = await this.contentRepository.findById(
        summary.bestPerformingContent,
        auth,
      );
      const outputs = content?.outputs as { text?: string } | null | undefined;
      const userEdits = content?.userEdits as
        | { text?: string }
        | null
        | undefined;
      const text = (userEdits?.text ?? outputs?.text ?? '').trim();
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
      this.contentRepository.findRecent(auth, 10),
      this.listRecentUploadChannelEvents(auth, 15),
    ]);

    const contentEvents: DashboardRecentActivityDto[] = recentContents.map(
      (c) => {
        const at = safeIso(c.updatedAt) ?? now.toISOString();
        const status = c.status as ContentStatus;
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
      },
    );

    const merged = [...contentEvents, ...recentUploadEvents].sort(
      (a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0),
    );
    return merged.slice(0, limit);
  }

  private async listRecentUploadChannelEvents(
    auth: TenancyAuth,
    limit: number,
  ): Promise<DashboardRecentActivityDto[]> {
    const relevantStatuses = new Set<UploadChannelStatus>([
      UploadChannelStatus.Published,
      UploadChannelStatus.Scheduled,
      UploadChannelStatus.Failed,
    ]);

    const rows = (await this.loadScopedChannels(auth))
      .filter((ch) => relevantStatuses.has(ch.status))
      .map((r) => ({
        ...r,
        eventAt:
          r.publishedAt ??
          r.scheduledAt ??
          r.updatedAt,
      }))
      .sort((a, b) => b.eventAt.getTime() - a.eventAt.getTime())
      .slice(0, limit);

    return rows
      .map((r) => {
        const at = safeIso(r.eventAt) ?? new Date().toISOString();
        const channel = r.channel;
        const uploadId = r.uploadId;
        const contentRef = r.contentRef;
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
