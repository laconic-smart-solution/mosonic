export type UploadChannelStatus =
  | "pending"
  | "scheduled"
  | "published"
  | "failed"

export type UploadJobStatus = "pending" | "partial" | "completed" | "failed"

export type UploadChannelRow = {
  channel: string
  status: UploadChannelStatus
  scheduledAt: string | null
  publishedAt: string | null
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

export type PublishUploadResponse =
  | { ok: true; skipped: true; message: string }
  | { ok: true; skipped: false; mcpResult: unknown }
