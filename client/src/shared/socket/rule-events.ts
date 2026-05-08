import { appConfig } from "@/app/config/app-config"
import { io, type Socket } from "socket.io-client"

export type RuleStartedEvent = { ruleId: string }
export type RuleReadingInputEvent = { ruleId: string; message?: string }
export type RuleInputProcessedEvent = { ruleId: string; message?: string }
export type RuleStreamingEvent = { ruleId: string; chunk: string }
export type RuleCompletedEvent = { ruleId: string }
export type RuleFailedEvent = { ruleId: string; message?: string }

let socketInstance: Socket | null = null

function getSocket() {
  if (socketInstance) {
    return socketInstance
  }
  socketInstance = io(appConfig.apiBaseUrl, {
    withCredentials: true,
    transports: ["websocket", "polling"],
  })
  return socketInstance
}

export function joinRuleRoom(ruleId: string) {
  const socket = getSocket()
  socket.emit("join", { room: `rule_${ruleId}` })
  return socket
}

export function leaveRuleRoom(ruleId: string) {
  const socket = getSocket()
  socket.emit("leave", { room: `rule_${ruleId}` })
}

export function onRuleStarted(handler: (payload: RuleStartedEvent) => void) {
  const socket = getSocket()
  socket.on("rule:started", handler)
  return () => socket.off("rule:started", handler)
}

export function onRuleReadingInput(handler: (payload: RuleReadingInputEvent) => void) {
  const socket = getSocket()
  socket.on("rule:reading_input", handler)
  return () => socket.off("rule:reading_input", handler)
}

export function onRuleInputProcessed(handler: (payload: RuleInputProcessedEvent) => void) {
  const socket = getSocket()
  socket.on("rule:input_processed", handler)
  return () => socket.off("rule:input_processed", handler)
}

export function onRuleStreaming(handler: (payload: RuleStreamingEvent) => void) {
  const socket = getSocket()
  socket.on("rule:streaming", handler)
  return () => socket.off("rule:streaming", handler)
}

export function onRuleCompleted(handler: (payload: RuleCompletedEvent) => void) {
  const socket = getSocket()
  socket.on("rule:completed", handler)
  return () => socket.off("rule:completed", handler)
}

export function onRuleFailed(handler: (payload: RuleFailedEvent) => void) {
  const socket = getSocket()
  socket.on("rule:failed", handler)
  return () => socket.off("rule:failed", handler)
}
