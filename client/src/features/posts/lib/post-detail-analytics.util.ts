import type {
  PostAnalyticsSnapshot,
  PostPlatformMetric,
  PostRecord,
} from "@/shared/types/post.type"

export type PostMetricTotals = {
  views: number
  likes: number
  comments: number
  reach: number
  engagement: number
}

export type PostAnalyticsChartRow = {
  platform: string
  label: string
  views: number
  likes: number
  comments: number
  engagement: number
}

export type PostAnalyticsDisplayRow = {
  platform: string
  metrics: PostMetricTotals
  hasSyncedMetrics: boolean
  syncStatus: PostPlatformMetric["syncStatus"]
  platformPostUrl: string | null
}

const EMPTY_TOTALS: PostMetricTotals = {
  views: 0,
  likes: 0,
  comments: 0,
  reach: 0,
  engagement: 0,
}

export function publishedChannelsForAnalytics(post: PostRecord): string[] {
  if (post.status === "published") {
    return [
      ...new Set(
        (post.channels ?? [])
          .map((c) => c.trim().toLowerCase())
          .filter(Boolean),
      ),
    ]
  }
  if (post.status === "partial") {
    return [
      ...new Set(
        (post.platformResults ?? [])
          .filter((r) => r.status === "published")
          .map((r) => r.platform.trim().toLowerCase())
          .filter(Boolean),
      ),
    ]
  }
  return []
}

export function isAnalyticsEligible(post: PostRecord | null | undefined): boolean {
  if (!post) return false
  return post.status === "published" || post.status === "partial"
}

function metricsToTotals(
  metrics: NonNullable<PostPlatformMetric["metrics"]>,
): PostMetricTotals {
  return {
    views: metrics.views ?? 0,
    likes: metrics.likes ?? 0,
    comments: metrics.comments ?? 0,
    reach: metrics.reach ?? 0,
    engagement: metrics.engagement ?? 0,
  }
}

export function buildAnalyticsDisplayRows(
  post: PostRecord,
  analytics: PostAnalyticsSnapshot | null | undefined,
): PostAnalyticsDisplayRow[] {
  const channels = publishedChannelsForAnalytics(post)
  const byPlatform = new Map(
    (analytics?.platformMetrics ?? []).map((row) => [
      row.platform.trim().toLowerCase(),
      row,
    ]),
  )

  return channels.map((platform) => {
    const row = byPlatform.get(platform)
    if (row?.metrics) {
      return {
        platform,
        metrics: metricsToTotals(row.metrics),
        hasSyncedMetrics: true,
        syncStatus: row.syncStatus,
        platformPostUrl: row.platformPostUrl ?? null,
      }
    }
    return {
      platform,
      metrics: { ...EMPTY_TOTALS },
      hasSyncedMetrics: false,
      syncStatus: row?.syncStatus ?? "pending",
      platformPostUrl: row?.platformPostUrl ?? null,
    }
  })
}

export function sumAnalyticsTotals(rows: PostAnalyticsDisplayRow[]): PostMetricTotals {
  return rows.reduce(
    (acc, row) => ({
      views: acc.views + row.metrics.views,
      likes: acc.likes + row.metrics.likes,
      comments: acc.comments + row.metrics.comments,
      reach: acc.reach + row.metrics.reach,
      engagement: acc.engagement + row.metrics.engagement,
    }),
    { ...EMPTY_TOTALS },
  )
}

export function buildAnalyticsChartData(
  rows: PostAnalyticsDisplayRow[],
): PostAnalyticsChartRow[] {
  return rows.map((row) => ({
    platform: row.platform,
    label: row.platform.charAt(0).toUpperCase() + row.platform.slice(1),
    views: row.metrics.views,
    likes: row.metrics.likes,
    comments: row.metrics.comments,
    engagement: row.metrics.engagement,
  }))
}
