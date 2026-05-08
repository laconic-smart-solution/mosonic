import { appConfig } from "@/app/config/app-config"
import { io, type Socket } from "socket.io-client"
import type { WorkflowNode } from "../types/workflow.type"

export type WorkflowStartedEvent = { workflowId: string }
export type WorkflowGeneratingEvent = { workflowId: string }
export type WorkflowCompletedEvent = { workflowId: string; nodes: WorkflowNode[] }
export type WorkflowFailedEvent = { workflowId: string; message?: string }

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

export function joinWorkflowRoom(workflowId: string) {
  const socket = getSocket()
  socket.emit("join", { room: `workflow_${workflowId}` })
  return socket
}

export function leaveWorkflowRoom(workflowId: string) {
  const socket = getSocket()
  socket.emit("leave", { room: `workflow_${workflowId}` })
}

export function onWorkflowStarted(handler: (payload: WorkflowStartedEvent) => void) {
  const socket = getSocket()
  socket.on("workflow:started", handler)
  return () => socket.off("workflow:started", handler)
}

export function onWorkflowGenerating(handler: (payload: WorkflowGeneratingEvent) => void) {
  const socket = getSocket()
  socket.on("workflow:generating", handler)
  return () => socket.off("workflow:generating", handler)
}

export function onWorkflowCompleted(handler: (payload: WorkflowCompletedEvent) => void) {
  const socket = getSocket()
  socket.on("workflow:completed", handler)
  return () => socket.off("workflow:completed", handler)
}

export function onWorkflowFailed(handler: (payload: WorkflowFailedEvent) => void) {
  const socket = getSocket()
  socket.on("workflow:failed", handler)
  return () => socket.off("workflow:failed", handler)
}
