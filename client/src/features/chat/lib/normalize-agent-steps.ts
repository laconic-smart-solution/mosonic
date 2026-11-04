import type { AgentStep } from "@/shared/services/chat.service"

/** Flatten legacy `tool_call` rows into Action + Observation for the UI. */
export function normalizeAgentSteps(steps: AgentStep[]): AgentStep[] {
  const out: AgentStep[] = []
  for (const step of steps) {
    if (step.type !== "tool_call") {
      out.push(step)
      continue
    }
    out.push({ type: "action", name: step.name, args: step.args })
    out.push({ type: "observation", name: step.name, result: step.result })
  }
  return out
}

// Also the "ask first" refusals (confirmation, preflight plan, image step, repeat post, wrong tool
// for this draft, nothing to change yet): nothing ran,
// and the real call after the user's answer gets its own row, so keeping these showed each step twice.
const SKIPPED_CODES =
  /"code"\s*:\s*"(one_mutation_per_turn|stalled|not_requested|ambiguous_choice|followup_read_only|confirmation_required|capability_gap|capability_mismatch|no_image_step|use_generate_more_adapt|already_started|rerun_pending|workflow_just_built|image_step_present|lane_unchanged)"/

/** Drop steps a guard skipped (they never ran): both the action and its observation. */
export function dropSkippedSteps(steps: AgentStep[]): AgentStep[] {
  const drop = new Set<number>()
  steps.forEach((s, i) => {
    if (s.type !== "observation") return
    const result = String((s as { result?: unknown }).result ?? "")
    if (!SKIPPED_CODES.test(result) && !/^Not run/.test(result)) return
    drop.add(i)
    const id = (s as { toolCallId?: string }).toolCallId
    for (let j = i - 1; j >= 0; j--) {
      const a = steps[j] as { type: string; name?: string; toolCallId?: string }
      if (a.type !== "action" || drop.has(j)) continue
      if (id ? a.toolCallId === id : a.name === (s as { name?: string }).name) { drop.add(j); break }
    }
  })
  // The run result shows as the run card; it is not a step the AI took.
  return steps.filter((s, i) => !drop.has(i) && (s as { name?: string }).name !== "pipeline_result")
}
