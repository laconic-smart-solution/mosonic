import { getSharedSocket } from "./socket-client"

export type AnalyticsPullStartedEvent = { ruleId: string }
export type AnalyticsPullSummary = {
  postsQueried: number
  platformRowsSynced: number
  pending: number
  failed: number
  noData: number
}

export type AnalyticsPullCompletedEvent = {
  analyticsId: string
  ruleRef: string
  summary?: AnalyticsPullSummary
  message?: string
}
export type AnalyticsSuggestionReadyEvent = {
  analyticsId: string
  ruleRef: string
  count: number
}
export type AnalyticsPullFailedEvent = {
  ruleId: string
  message?: string
  summary?: AnalyticsPullSummary
}

export function joinAnalyticsRuleRoom(ruleId: string) {
  const socket = getSharedSocket()
  socket.emit("join", { room: `analytics_${ruleId}` })
  return socket
}

export function leaveAnalyticsRuleRoom(ruleId: string) {
  const socket = getSharedSocket()
  socket.emit("leave", { room: `analytics_${ruleId}` })
}

export function onAnalyticsPullStarted(handler: (payload: AnalyticsPullStartedEvent) => void) {
  const socket = getSharedSocket()
  socket.on("analytics:pull_started", handler)
  return () => socket.off("analytics:pull_started", handler)
}

export function onAnalyticsPullCompleted(handler: (payload: AnalyticsPullCompletedEvent) => void) {
  const socket = getSharedSocket()
  socket.on("analytics:pull_completed", handler)
  return () => socket.off("analytics:pull_completed", handler)
}

export function onAnalyticsSuggestionReady(handler: (payload: AnalyticsSuggestionReadyEvent) => void) {
  const socket = getSharedSocket()
  socket.on("analytics:suggestion_ready", handler)
  return () => socket.off("analytics:suggestion_ready", handler)
}

export function onAnalyticsPullFailed(handler: (payload: AnalyticsPullFailedEvent) => void) {
  const socket = getSharedSocket()
  socket.on("analytics:pull_failed", handler)
  return () => socket.off("analytics:pull_failed", handler)
}
