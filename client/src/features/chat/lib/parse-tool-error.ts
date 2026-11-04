import type { AgentStep } from "@/shared/services/chat.service"

export type ToolErrorInfo = {
  toolName: string
  code: string
  message: string
  /** Set when the change can only be made on the workflow canvas. */
  canvasPath?: string
}

/** Guard-rail codes the AI recovers from on its own — never surfaced as a recovery dialog. */
const SILENT_CODES = new Set([
  "one_mutation_per_turn",
  "confirmation_required",
  "followup_read_only",
  "order_not_supported",
  "edit_not_supported",
  "ambiguous_choice",
  // Expected preconditions the AI handles in its reply (offers a fix) - not failures.
  "no_workflow",
  "no_content",
  "workflow_exists",
  "generation_in_progress",
  "unsupported_channel",
  "lane_taken",
  "url_not_provided",
])

export function isSilentToolCode(code: string): boolean {
  return SILENT_CODES.has(code)
}

export function parseToolError(toolName: string, result: string): ToolErrorInfo | null {
  try {
    const parsed: unknown = JSON.parse(result)
    if (!parsed || typeof parsed !== "object") return null
    const obj = parsed as Record<string, unknown>
    if (obj.ok !== false || typeof obj.code !== "string") return null
    return {
      toolName,
      code: obj.code,
      message: typeof obj.message === "string" ? obj.message : "",
      ...(obj.openCanvas === true && typeof obj.canvasPath === "string" ? { canvasPath: obj.canvasPath } : {}),
    }
  } catch {
    return null
  }
}

/** Last user-facing tool error in a turn (observation `{ ok: false, code, message }`). */
export function findToolError(steps: AgentStep[] | null): ToolErrorInfo | null {
  if (!steps) return null
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i]
    if (step.type !== "observation" && step.type !== "tool_call") continue
    const info = parseToolError(step.name, step.result)
    if (info && !SILENT_CODES.has(info.code)) return info
  }
  return null
}

/** Canvas link from a tool that couldn't make a workflow change from chat. */
export function findCanvasLink(steps: AgentStep[] | null): string | null {
  if (!steps) return null
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i]
    if (step.type !== "observation" && step.type !== "tool_call") continue
    const info = parseToolError(step.name, step.result)
    if (info?.canvasPath) return info.canvasPath
  }
  return null
}
