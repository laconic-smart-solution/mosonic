export type UploadChannelStatus =
  | "pending"
  | "publishing"
  | "scheduled"
  | "published"
  | "failed"
  | "skipped"

export type UploadJobStatus =
  | "pending"
  | "running"
  | "partial"
  | "completed"
  | "failed"

export type CaptionMappingSource = "text" | "translatedText" | "summary"

export type ChannelMediaMapping = "image" | "video"

/** GET /upload/:id channel row */
export type UploadChannelRow = {
  channel: string
  included: boolean
  status: UploadChannelStatus
  caption: string
  mediaUrl: string | null
  mediaUrls: string[]
  youtubeTitle: string | null
  scheduledAt: string | null
  publishedAt: string | null
  zernioPostId: string | null
  failureReason: string | null
}

export type UploadResolvedOutputs = {
  text?: string
  image?: string
  translatedText?: string
  video?: string
  transcription?: string
  summary?: string
}

export type UploadDetail = {
  uploadId: string
  contentRef: string
  status: UploadJobStatus
  channels: UploadChannelRow[]
  resolvedOutputs: UploadResolvedOutputs
}

export type PublishUploadSuccess = { success: true }

export type ChannelPublishRequest = {
  channel: string
  included: boolean
}

export type PublishUploadRequest = {
  publishNow: boolean
  scheduledAt?: string | null
  channels: ChannelPublishRequest[]
}

export type PatchUploadChannelBody = {
  included?: boolean
  caption?: string | null
  mediaUrl?: string | null
  mediaUrls?: string[]
  youtubeTitle?: string | null
}

export type PatchUploadChannelSuccess = { success: true }

export type UpdateUploadBody = {
  caption?: string | null
  scheduledAt?: string | null
  youtubeTitle?: string | null
}

export type UpdateUploadSuccess = { success: true }

export type UploadStatusSummary = {
  total: number
  publishing: number
  scheduled: number
  published: number
  failed: number
  skipped: number
}

export type UploadStatusDetail = {
  uploadId: string
  status: UploadJobStatus
  channels: UploadChannelRow[]
  summary: UploadStatusSummary
}
