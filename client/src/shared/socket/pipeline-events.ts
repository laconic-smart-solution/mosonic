import {
  joinSocketRoom,
  leaveSocketRoom,
  subscribeSocketEvent,
} from "./socket-client"

type SocketHandler = (...args: unknown[]) => void

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
  return subscribeSocketEvent("pipeline:started", handler as SocketHandler)
}
export function onPipelinePaused(handler: (payload: PipelinePausedEvent) => void) {
  return subscribeSocketEvent("pipeline:paused", handler as SocketHandler)
}
export function onPipelineLanePaused(
  handler: (payload: PipelineLanePausedEvent) => void,
) {
  return subscribeSocketEvent("pipeline:lane_paused", handler as SocketHandler)
}
export function onPipelineCompleted(handler: (payload: PipelineCompletedEvent) => void) {
  return subscribeSocketEvent("pipeline:completed", handler as SocketHandler)
}
export function onPipelineFailed(handler: (payload: PipelineFailedEvent) => void) {
  return subscribeSocketEvent("pipeline:failed", handler as SocketHandler)
}

export function onNodeStarted(handler: (payload: NodeStartedEvent) => void) {
  return subscribeSocketEvent("node:started", handler as SocketHandler)
}
export function onNodeStreaming(handler: (payload: NodeStreamingEvent) => void) {
  return subscribeSocketEvent("node:streaming", handler as SocketHandler)
}
export function onNodeProcessing(handler: (payload: NodeProcessingEvent) => void) {
  return subscribeSocketEvent("node:processing", handler as SocketHandler)
}
export function onNodeRetrying(handler: (payload: NodeRetryingEvent) => void) {
  return subscribeSocketEvent("node:retrying", handler as SocketHandler)
}
export function onNodeCompleted(handler: (payload: NodeCompletedEvent) => void) {
  return subscribeSocketEvent("node:completed", handler as SocketHandler)
}
export function onNodeFailedFinal(handler: (payload: NodeFailedFinalEvent) => void) {
  return subscribeSocketEvent("node:failed_final", handler as SocketHandler)
}
