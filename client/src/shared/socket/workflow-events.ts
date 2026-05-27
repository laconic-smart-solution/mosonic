import type { WorkflowEdge, WorkflowNode } from "../types/workflow.type"

import { getSharedSocket } from "./socket-client"

export type WorkflowStartedEvent = { workflowId: string }
export type WorkflowGeneratingEvent = { workflowId: string }
export type WorkflowCompletedEvent = {
  workflowId: string
  nodes: WorkflowNode[]
  edges?: WorkflowEdge[]
}
export type WorkflowFailedEvent = { workflowId: string; message?: string }

export function joinWorkflowRoom(workflowId: string) {
  const socket = getSharedSocket()
  socket.emit("join", { room: `workflow_${workflowId}` })
  return socket
}

export function leaveWorkflowRoom(workflowId: string) {
  const socket = getSharedSocket()
  socket.emit("leave", { room: `workflow_${workflowId}` })
}

export function onWorkflowStarted(handler: (payload: WorkflowStartedEvent) => void) {
  const socket = getSharedSocket()
  socket.on("workflow:started", handler)
  return () => socket.off("workflow:started", handler)
}

export function onWorkflowGenerating(handler: (payload: WorkflowGeneratingEvent) => void) {
  const socket = getSharedSocket()
  socket.on("workflow:generating", handler)
  return () => socket.off("workflow:generating", handler)
}

export function onWorkflowCompleted(handler: (payload: WorkflowCompletedEvent) => void) {
  const socket = getSharedSocket()
  socket.on("workflow:completed", handler)
  return () => socket.off("workflow:completed", handler)
}

export function onWorkflowFailed(handler: (payload: WorkflowFailedEvent) => void) {
  const socket = getSharedSocket()
  socket.on("workflow:failed", handler)
  return () => socket.off("workflow:failed", handler)
}
