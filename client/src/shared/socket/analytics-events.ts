import { appConfig } from "@/app/config/app-config"
import { io, type Socket } from "socket.io-client"

export type AnalyticsPullStartedEvent = { ruleId: string }
export type AnalyticsPullCompletedEvent = { analyticsId: string; ruleRef: string }
export type AnalyticsSuggestionReadyEvent = {
  analyticsId: string
  ruleRef: string
  count: number
}
export type AnalyticsPullFailedEvent = { ruleId: string; message?: string }

let socketInstance: Socket | null = null

function getSocket() {
  if (socketInstance) return socketInstance
  socketInstance = io(appConfig.apiBaseUrl, {
    withCredentials: true,
    transports: ["websocket", "polling"],
  })
  return socketInstance
}

export function joinAnalyticsRuleRoom(ruleId: string) {
  const socket = getSocket()
  socket.emit("join", { room: `analytics_${ruleId}` })
  return socket
}

export function leaveAnalyticsRuleRoom(ruleId: string) {
  const socket = getSocket()
  socket.emit("leave", { room: `analytics_${ruleId}` })
}

export function onAnalyticsPullStarted(handler: (payload: AnalyticsPullStartedEvent) => void) {
  const socket = getSocket()
  socket.on("analytics:pull_started", handler)
  return () => socket.off("analytics:pull_started", handler)
}

export function onAnalyticsPullCompleted(handler: (payload: AnalyticsPullCompletedEvent) => void) {
  const socket = getSocket()
  socket.on("analytics:pull_completed", handler)
  return () => socket.off("analytics:pull_completed", handler)
}

export function onAnalyticsSuggestionReady(handler: (payload: AnalyticsSuggestionReadyEvent) => void) {
  const socket = getSocket()
  socket.on("analytics:suggestion_ready", handler)
  return () => socket.off("analytics:suggestion_ready", handler)
}

export function onAnalyticsPullFailed(handler: (payload: AnalyticsPullFailedEvent) => void) {
  const socket = getSocket()
  socket.on("analytics:pull_failed", handler)
  return () => socket.off("analytics:pull_failed", handler)
}
