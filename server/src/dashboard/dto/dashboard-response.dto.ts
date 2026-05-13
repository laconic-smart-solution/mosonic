import type { ContentStatus } from '../../content/schemas/content.schema';

export type DashboardStatsDto = {
  postsPublishedThisMonth: number;
  pendingReviewCount: number;
  scheduledPostsCount: number;
  totalReachThisWeek: number;
};

export type DashboardActionItemsDto = {
  pendingContentCount: number;
  pendingSuggestionsCount: number;
  failedPostsCount: number;
};

export type DashboardUpcomingScheduledItemDto = {
  uploadId: string;
  contentRef: string;
  ruleRef: string;
  channel: string;
  caption: string;
  scheduledAt: string;
};

export type DashboardWeeklyPerformanceDto = {
  reach: number;
  likes: number;
  comments: number;
  clicks: number;
  bestChannel: string;
  bestContent: string;
};

export type DashboardRecentActivityDto = {
  kind:
    | 'content_approved'
    | 'content_rejected'
    | 'content_draft_updated'
    | 'upload_scheduled'
    | 'upload_published'
    | 'upload_failed';
  label: string;
  at: string;
  contentRef?: string;
  uploadId?: string;
  channel?: string;
  status?: ContentStatus;
};

export type DashboardResponseDto = {
  stats: DashboardStatsDto;
  actionItems: DashboardActionItemsDto;
  upcomingScheduled: DashboardUpcomingScheduledItemDto[];
  weeklyPerformance: DashboardWeeklyPerformanceDto;
  recentActivity: DashboardRecentActivityDto[];
};

