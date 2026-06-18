export type PostStatus =
  | "pending"
  | "scheduled"
  | "published"
  | "failed"
  | "cancelled"
  | "partial"

export type PlatformPostStatus =
  | "pending"
  | "scheduled"
  | "published"
  | "failed"
  | "cancelled"

export type PostPlatformResult = {
  platform: string
  status: PlatformPostStatus
  platformUrl?: string | null
  publishedAt?: string | null
  failureReason?: string | null
}

/** Matches server `PostListSort` */
export type PostListSort =
  | "newest_created"
  | "oldest_created"
  | "scheduled_desc"
  | "scheduled_asc"
  | "status_asc"

export type PostMediaItem = {
  url: string
  kind: "image" | "video"
}

/** Mongo `posts` document shape as returned by the API */
export type PostRecord = {
  postId: string
  userId: string
  uploadRef: string
  ruleRef: string
  contentRef: string
  zernioPostId?: string | null
  channels: string[]
  scheduledAt?: string | null
  publishedAt?: string | null
  status: PostStatus
  platformResults?: PostPlatformResult[]
  retryCount?: number
  failureReason?: string | null
  publishedNow?: boolean
  createdAt?: string
  updatedAt?: string
  /** Server-enriched list row preview (~160 chars) */
  captionPreview?: string | null
  youtubeTitlePreview?: string | null
  /** First image or video URL from upload channel media (list enrichment) */
  mediaPreviewUrl?: string | null
  mediaKind?: "image" | "video" | null
  /** Full caption from upload (detail enrichment) */
  detailCaption?: string | null
  /** All media from upload channels (detail enrichment) */
  mediaItems?: PostMediaItem[]
}

export type PostsListQueryParams = {
  page?: number
  limit?: number
  status?: PostStatus
  sort?: PostListSort
  channel?: string
  search?: string
  ruleRef?: string
  uploadRef?: string
  from?: string
  to?: string
}

export type PostsStatsResponse = {
  total: number
  byStatus: Partial<Record<PostStatus, number>>
}

export type PostsListResponse = {
  posts: PostRecord[]
  total: number
  page: number
  totalPages: number
}

export type PostDetailHydrated = {
  local: PostRecord
  remote: Record<string, unknown> | null
  analytics?: PostAnalyticsSnapshot | null
}

export type PostAnalyticsSnapshot = {
  postId: string
  zernioPostId: string
  syncStatus: "pending" | "synced" | "partial" | "unavailable"
  pulledAt: string
  period: { from: string; to: string }
  platformMetrics: PostPlatformMetric[]
}

export type PostPlatformMetric = {
  platform: string
  metrics: {
    views: number
    clicks: number
    engagement: number
    conversions: number
    likes: number
    comments: number
    shares: number
    reach: number
    engagementRate: number
  } | null
  syncStatus: "pending" | "synced" | "failed" | "unavailable"
  platformPostUrl: string | null
  errorMessage: string | null
}

export type PostDetailResponse =
  | (PostRecord & { analytics?: PostAnalyticsSnapshot | null })
  | PostDetailHydrated

export type PatchPostBody = {
  scheduledAt?: string
  content?: string
  title?: string
  mediaUrl?: string | null
  mediaUrls?: string[]
}

export type BulkPostIdsBody = {
  postIds: string[]
}

export type BulkScheduleBody = BulkPostIdsBody & {
  scheduledAt: string
}

export type BulkOpResult = {
  succeeded: number
  failed: number
}

export type DeletePostResult = {
  success: true
  skipped: string[]
  message: string
  removed: boolean
}

export type BulkDeleteResult = {
  total: number
  succeeded: number
  failed: number
  skipped: Record<string, string[]>
}
