import {
  getSharedSocket,
  joinSocketRoom,
  leaveSocketRoom,
  subscribeSocketEvent,
} from "./socket-client"

type SocketHandler = (...args: unknown[]) => void

function subscribePipelineEvent(
  event: string,
  handler: SocketHandler,
): () => void {
  getSharedSocket()
  return subscribeSocketEvent(event, handler)
}

export type PipelineStartedEvent = { pipelineId: string; totalNodes: number }
export type PipelinePausedEvent = {
  pipelineId: string
  nodeId: string
  nodeType: string
  pausedLaneId?: string | null
}
export type PipelineLanePausedEvent = {
  pipelineId: string
  nodeId: string
  nodeType: string
  pausedLaneId?: string | null
}
export type PipelineCompletedEvent = {
  pipelineId: string
  contentId: string
  /** Present when the server created an upload sidecar for this pipeline */
  uploadId?: string
}
export type PipelineFailedEvent = {
  pipelineId: string
  message?: string
  reason?: string
}

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
  return joinSocketRoom(`pipeline:${pipelineId}`)
}

export function leavePipelineRoom(pipelineId: string) {
  leaveSocketRoom(`pipeline:${pipelineId}`)
}

export function onPipelineStarted(handler: (payload: PipelineStartedEvent) => void) {
  return subscribePipelineEvent("pipeline:started", handler as SocketHandler)
}
export function onPipelinePaused(handler: (payload: PipelinePausedEvent) => void) {
  return subscribePipelineEvent("pipeline:paused", handler as SocketHandler)
}
export function onPipelineLanePaused(
  handler: (payload: PipelineLanePausedEvent) => void,
) {
  return subscribePipelineEvent("pipeline:lane_paused", handler as SocketHandler)
}
export function onPipelineCompleted(handler: (payload: PipelineCompletedEvent) => void) {
  return subscribePipelineEvent("pipeline:completed", handler as SocketHandler)
}
export function onPipelineFailed(handler: (payload: PipelineFailedEvent) => void) {
  return subscribePipelineEvent("pipeline:failed", handler as SocketHandler)
}

export function onNodeStarted(handler: (payload: NodeStartedEvent) => void) {
  return subscribePipelineEvent("node:started", handler as SocketHandler)
}
export function onNodeStreaming(handler: (payload: NodeStreamingEvent) => void) {
  return subscribePipelineEvent("node:streaming", handler as SocketHandler)
}
export function onNodeProcessing(handler: (payload: NodeProcessingEvent) => void) {
  return subscribePipelineEvent("node:processing", handler as SocketHandler)
}
export function onNodeRetrying(handler: (payload: NodeRetryingEvent) => void) {
  return subscribePipelineEvent("node:retrying", handler as SocketHandler)
}
export function onNodeCompleted(handler: (payload: NodeCompletedEvent) => void) {
  return subscribePipelineEvent("node:completed", handler as SocketHandler)
}
export function onNodeFailedFinal(handler: (payload: NodeFailedFinalEvent) => void) {
  return subscribePipelineEvent("node:failed_final", handler as SocketHandler)
}
