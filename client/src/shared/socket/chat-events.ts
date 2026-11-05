import { getSharedSocket, joinSocketRoom, leaveSocketRoom } from "./socket-client"
import type { AgentStep, ChatMessage, ChatRunProgress } from "../services/chat.service"

/** `followUp` = automatic report turn after a chat-started run finished. */
export type ChatStartedEvent = { sessionId: string; followUp?: boolean; pipelineId?: string }
export type ChatStepEvent = { sessionId: string; step: AgentStep }
export type ChatCompletedEvent = {
  sessionId: string
  assistantMessage: ChatMessage
  followUp?: boolean
  pipelineId?: string
}
export type ChatFailedEvent = { sessionId: string; message?: string }

export function joinChatRoom(sessionId: string) {
  return joinSocketRoom(`chat_${sessionId}`)
}

export function leaveChatRoom(sessionId: string) {
  leaveSocketRoom(`chat_${sessionId}`)
}

export function onChatStarted(handler: (payload: ChatStartedEvent) => void) {
  const socket = getSharedSocket()
  socket.on("chat:started", handler)
  return () => socket.off("chat:started", handler)
}

export function onChatStep(handler: (payload: ChatStepEvent) => void) {
  const socket = getSharedSocket()
  socket.on("chat:step", handler)
  return () => socket.off("chat:step", handler)
}

export function onChatCompleted(handler: (payload: ChatCompletedEvent) => void) {
  const socket = getSharedSocket()
  socket.on("chat:completed", handler)
  return () => socket.off("chat:completed", handler)
}

export function onChatRunProgress(handler: (payload: ChatRunProgress) => void) {
  const socket = getSharedSocket()
  socket.on("chat:run-progress", handler)
  return () => socket.off("chat:run-progress", handler)
}

export function onChatFailed(handler: (payload: ChatFailedEvent) => void) {
  const socket = getSharedSocket()
  socket.on("chat:failed", handler)
  return () => socket.off("chat:failed", handler)
}
