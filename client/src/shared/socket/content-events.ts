import { getSharedSocket, joinSocketRoom, leaveSocketRoom } from "./socket-client"

export type ContentNodeStartedEvent = {
  contentId: string
  nodeId: string
  nodeType: string
  order: number
  totalNodes: number
}

export type ContentNodeStreamingEvent = {
  contentId: string
  nodeId: string
  chunk: string
}

export type ContentNodeProcessingEvent = {
  contentId: string
  nodeId: string
  message: string
}

export type ContentNodeRetryingEvent = {
  contentId: string
  nodeId: string
  nodeType: string
  attempt: number
  maxAttempts: number
}

export type ContentNodeFailedFinalEvent = {
  contentId: string
  nodeId: string
  nodeType: string
  message: string
}

export type ContentNodeRerunCompletedEvent = {
  contentId: string
  nodeId: string
  nodeType: string
  output: Record<string, unknown>
}

export function joinContentRoom(contentId: string) {
  return joinSocketRoom(`content_${contentId}`)
}

export function leaveContentRoom(contentId: string) {
  leaveSocketRoom(`content_${contentId}`)
}

export function onContentNodeStarted(
  handler: (payload: ContentNodeStartedEvent) => void
) {
  const socket = getSharedSocket()
  socket.on("node:started", handler)
  return () => socket.off("node:started", handler)
}

export function onContentNodeStreaming(
  handler: (payload: ContentNodeStreamingEvent) => void
) {
  const socket = getSharedSocket()
  socket.on("node:streaming", handler)
  return () => socket.off("node:streaming", handler)
}

export function onContentNodeProcessing(
  handler: (payload: ContentNodeProcessingEvent) => void
) {
  const socket = getSharedSocket()
  socket.on("node:processing", handler)
  return () => socket.off("node:processing", handler)
}

export function onContentNodeRetrying(
  handler: (payload: ContentNodeRetryingEvent) => void
) {
  const socket = getSharedSocket()
  socket.on("node:retrying", handler)
  return () => socket.off("node:retrying", handler)
}

export function onContentNodeFailedFinal(
  handler: (payload: ContentNodeFailedFinalEvent) => void
) {
  const socket = getSharedSocket()
  socket.on("node:failed_final", handler)
  return () => socket.off("node:failed_final", handler)
}

export function onContentNodeRerunCompleted(
  handler: (payload: ContentNodeRerunCompletedEvent) => void
) {
  const socket = getSharedSocket()
  socket.on("node:rerun_completed", handler)
  return () => socket.off("node:rerun_completed", handler)
}
