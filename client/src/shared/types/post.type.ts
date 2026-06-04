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
}

export type PostDetailResponse = PostRecord | PostDetailHydrated

export type PatchPostBody = {
  scheduledAt?: string
  content?: string
  title?: string
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
