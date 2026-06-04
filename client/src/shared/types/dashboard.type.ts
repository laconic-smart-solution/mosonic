import type { ContentStatus } from "./content.type"

export type DashboardStats = {
  postsPublishedThisMonth: number
  pendingReviewCount: number
  scheduledPostsCount: number
  totalReachThisWeek: number
}

export type DashboardActionItems = {
  pendingContentCount: number
  pendingSuggestionsCount: number
  failedPostsCount: number
}

export type DashboardUpcomingScheduledItem = {
  uploadId: string
  contentRef: string
  ruleRef: string
  channel: string
  caption: string
  scheduledAt: string
}

export type DashboardWeeklyPerformance = {
  reach: number
  likes: number
  comments: number
  clicks: number
  bestChannel: string
  bestContent: string
}

export type DashboardRecentActivityItem = {
  kind:
    | "content_approved"
    | "content_rejected"
    | "content_draft_updated"
    | "upload_scheduled"
    | "upload_published"
    | "upload_failed"
  label: string
  at: string
  contentRef?: string
  uploadId?: string
  channel?: string
  status?: ContentStatus
}

export type DashboardResponse = {
  stats: DashboardStats
  actionItems: DashboardActionItems
  upcomingScheduled: DashboardUpcomingScheduledItem[]
  weeklyPerformance: DashboardWeeklyPerformance
  recentActivity: DashboardRecentActivityItem[]
}

