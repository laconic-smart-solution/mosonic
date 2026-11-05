import type { AgentStep } from "@/shared/services/chat.service"

/**
 * Add one live `chat:step` to the trace, ignoring a repeat of a step we already have
 * (same type + toolCallId, e.g. a re-delivered event after a socket reconnect).
 */
export function appendLiveStep(prev: AgentStep[], step: AgentStep): AgentStep[] {
  const id = (step as { toolCallId?: string }).toolCallId
  if (id && (step.type === "action" || step.type === "observation")) {
    const seen = prev.some((s) => s.type === step.type && (s as { toolCallId?: string }).toolCallId === id)
    if (seen) return prev
  }
  return [...prev, step]
}
