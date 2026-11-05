import type { AgentStep, ChatMessage, ChatRunProgress } from "@/shared/services/chat.service"

/** Pipelines started by start_generation in this message's steps. */
export function findStartedRunIds(steps: AgentStep[] | null): string[] {
  if (!steps) return []
  const ids: string[] = []
  for (const step of steps) {
    if (step.type !== "observation" && step.type !== "tool_call") continue
    try {
      const parsed = JSON.parse(step.result) as { ok?: unknown; action?: unknown; pipelineId?: unknown }
      if (parsed.ok === true && parsed.action === "pipeline_started" && typeof parsed.pipelineId === "string") {
        // Eval dry runs never enqueue a pipeline - nothing to poll.
        if (parsed.pipelineId.startsWith("dryrun-")) continue
        if (!ids.includes(parsed.pipelineId)) ids.push(parsed.pipelineId)
      }
    } catch {
      // not JSON
    }
  }
  return ids
}

/** pipelineId of the automatic follow-up report in this message, if it is one. */
export function findRunReportId(steps: AgentStep[] | null): string | null {
  if (!steps) return null
  for (const step of steps) {
    if (step.type === "action" && step.name === "pipeline_result") {
      const id = step.args?.pipelineId
      if (typeof id === "string") return id
    }
  }
  return null
}

export function isRunReported(messages: ChatMessage[], pipelineId: string): boolean {
  return messages.some((m) => m.role === "assistant" && findRunReportId(m.steps) === pipelineId)
}

/** "about N min left" / "about Ns left", rounded so it does not flicker every tick. */
export function remainingLabel(ms: number | null): { key: "seconds" | "minutes" | "almost"; count: number } | null {
  if (ms === null || !Number.isFinite(ms)) return null
  if (ms <= 5_000) return { key: "almost", count: 0 }
  if (ms < 60_000) return { key: "seconds", count: Math.max(10, Math.round(ms / 10_000) * 10) }
  return { key: "minutes", count: Math.round(ms / 60_000) }
}

export function runDurationSeconds(progress: ChatRunProgress): number | null {
  if (!progress.completedAt) return null
  const ms = new Date(progress.completedAt).getTime() - new Date(progress.startedAt).getTime()
  return Number.isFinite(ms) && ms >= 0 ? Math.round(ms / 1000) : null
}

export function progressFraction(progress: ChatRunProgress): number {
  if (progress.steps.length === 0) return 0
  const done = progress.steps.filter((s) => s.status === "done" || s.status === "skipped").length
  const running = progress.steps.some((s) => s.status === "running") ? 0.5 : 0
  return Math.min(1, (done + running) / progress.steps.length)
}

/** Remaining estimate counted down locally between server events. */
export function liveRemainingMs(progress: ChatRunProgress, receivedAt: number, now: number): number | null {
  if (progress.status !== "running" || progress.estimatedRemainingMs === null) return null
  return Math.max(0, progress.estimatedRemainingMs - (now - receivedAt))
}
