import type { AgentStep } from "@/shared/services/chat.service"

export type RunBrief = { pipelineId: string; topic: string; channels: string[]; style: string | null; images: boolean }

/** The brief (topic, channels, style) start_generation returned for each run this message started. */
export function findRunBriefs(steps: AgentStep[] | null): RunBrief[] {
  if (!steps) return []
  const out: RunBrief[] = []
  for (const step of steps) {
    if (step.type !== "observation" && step.type !== "tool_call") continue
    try {
      const p = JSON.parse(step.result) as { ok?: unknown; action?: unknown; pipelineId?: unknown; brief?: Record<string, unknown> }
      if (p.ok !== true || p.action !== "pipeline_started" || typeof p.pipelineId !== "string" || !p.brief) continue
      const b = p.brief
      out.push({
        pipelineId: p.pipelineId,
        topic: typeof b.topic === "string" ? b.topic : "",
        channels: Array.isArray(b.channels) ? b.channels.filter((c): c is string => typeof c === "string") : [],
        style: typeof b.style === "string" && b.style.trim() ? b.style.trim() : null,
        images: b.images === true,
      })
    } catch {
      // not JSON
    }
  }
  return out
}
