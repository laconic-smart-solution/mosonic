import { getSharedSocket } from "./socket-client"

export type PipelineStartedEvent = { pipelineId: string; totalNodes: number }
export type PipelinePausedEvent = { pipelineId: string; nodeId: string; nodeType: string }
export type PipelineCompletedEvent = {
  pipelineId: string
  contentId: string
  /** Present when the server created an upload sidecar for this pipeline */
  uploadId?: string
}
export type PipelineFailedEvent = { pipelineId: string; message?: string }

export type NodeStartedEvent = {
  pipelineId: string
  nodeId: string
  nodeType: string
  order: number
  totalNodes: number
}
export type NodeStreamingEvent = { pipelineId: string; nodeId: string; chunk: string }
export type NodeProcessingEvent = { pipelineId: string; nodeId: string; message: string }
export type NodeRetryingEvent = {
  pipelineId: string
  nodeId: string
  nodeType: string
  attempt: number
  maxAttempts: number
}
export type NodeCompletedEvent = {
  pipelineId: string
  nodeId: string
  nodeType: string
  order: number
  totalNodes: number
  output: Record<string, unknown>
}
export type NodeFailedFinalEvent = {
  pipelineId: string
  nodeId: string
  nodeType: string
  message: string
}

export function joinPipelineRoom(pipelineId: string) {
  const socket = getSharedSocket()
  socket.emit("join", { room: `pipeline:${pipelineId}` })
  return socket
}

export function leavePipelineRoom(pipelineId: string) {
  const socket = getSharedSocket()
  socket.emit("leave", { room: `pipeline:${pipelineId}` })
}

export function onPipelineStarted(handler: (payload: PipelineStartedEvent) => void) {
  const socket = getSharedSocket()
  socket.on("pipeline:started", handler)
  return () => socket.off("pipeline:started", handler)
}
export function onPipelinePaused(handler: (payload: PipelinePausedEvent) => void) {
  const socket = getSharedSocket()
  socket.on("pipeline:paused", handler)
  return () => socket.off("pipeline:paused", handler)
}
export function onPipelineCompleted(handler: (payload: PipelineCompletedEvent) => void) {
  const socket = getSharedSocket()
  socket.on("pipeline:completed", handler)
  return () => socket.off("pipeline:completed", handler)
}
export function onPipelineFailed(handler: (payload: PipelineFailedEvent) => void) {
  const socket = getSharedSocket()
  socket.on("pipeline:failed", handler)
  return () => socket.off("pipeline:failed", handler)
}

export function onNodeStarted(handler: (payload: NodeStartedEvent) => void) {
  const socket = getSharedSocket()
  socket.on("node:started", handler)
  return () => socket.off("node:started", handler)
}
export function onNodeStreaming(handler: (payload: NodeStreamingEvent) => void) {
  const socket = getSharedSocket()
  socket.on("node:streaming", handler)
  return () => socket.off("node:streaming", handler)
}
export function onNodeProcessing(handler: (payload: NodeProcessingEvent) => void) {
  const socket = getSharedSocket()
  socket.on("node:processing", handler)
  return () => socket.off("node:processing", handler)
}
export function onNodeRetrying(handler: (payload: NodeRetryingEvent) => void) {
  const socket = getSharedSocket()
  socket.on("node:retrying", handler)
  return () => socket.off("node:retrying", handler)
}
export function onNodeCompleted(handler: (payload: NodeCompletedEvent) => void) {
  const socket = getSharedSocket()
  socket.on("node:completed", handler)
  return () => socket.off("node:completed", handler)
}
export function onNodeFailedFinal(handler: (payload: NodeFailedFinalEvent) => void) {
  const socket = getSharedSocket()
  socket.on("node:failed_final", handler)
  return () => socket.off("node:failed_final", handler)
}
