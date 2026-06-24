import { getSharedSocket, joinSocketRoom, leaveSocketRoom } from "./socket-client"

export type UploadStartedEvent = { uploadId: string; channel: string }
export type UploadCompletedEvent = {
  uploadId: string
  channel: string
  postId?: string | null
}
export type UploadFailedEvent = {
  uploadId: string
  channel: string
  message?: string
}
export type UploadScheduledEvent = {
  uploadId: string
  channel: string
  scheduledAt: string
  postId?: string | null
}
export type UploadAllCompletedEvent = {
  uploadId: string
  publishNow?: boolean
  scheduledAt?: string | null
  channelsPublished?: string[]
  summary?: Record<string, unknown>
}
export type UploadUpdatedEvent = {
  uploadId: string
  caption?: string
  scheduledAt?: string | null
  youtubeTitle?: string | null
  channels?: Array<{
    channel: string
    status: "scheduled"
    caption: string
    mediaUrl: string | null
    mediaUrls: string[]
    youtubeTitle: string | null
    scheduledAt: string | null
    publishedAt: string | null
    failureReason: string | null
  }>
}

export function joinUploadRoom(uploadId: string) {
  return joinSocketRoom(`upload_${uploadId}`)
}

export function leaveUploadRoom(uploadId: string) {
  leaveSocketRoom(`upload_${uploadId}`)
}

export function onUploadStarted(
  handler: (payload: UploadStartedEvent) => void
) {
  const socket = getSharedSocket()
  socket.on("upload:started", handler)
  return () => socket.off("upload:started", handler)
}

export function onUploadCompleted(
  handler: (payload: UploadCompletedEvent) => void
) {
  const socket = getSharedSocket()
  socket.on("upload:completed", handler)
  return () => socket.off("upload:completed", handler)
}

export function onUploadFailed(handler: (payload: UploadFailedEvent) => void) {
  const socket = getSharedSocket()
  socket.on("upload:failed", handler)
  return () => socket.off("upload:failed", handler)
}

export function onUploadScheduled(
  handler: (payload: UploadScheduledEvent) => void
) {
  const socket = getSharedSocket()
  socket.on("upload:scheduled", handler)
  return () => socket.off("upload:scheduled", handler)
}

export function onUploadAllCompleted(
  handler: (payload: UploadAllCompletedEvent) => void
) {
  const socket = getSharedSocket()
  socket.on("upload:all_completed", handler)
  return () => socket.off("upload:all_completed", handler)
}

export function onUploadUpdated(
  handler: (payload: UploadUpdatedEvent) => void
) {
  const socket = getSharedSocket()
  socket.on("upload:updated", handler)
  return () => socket.off("upload:updated", handler)
}
