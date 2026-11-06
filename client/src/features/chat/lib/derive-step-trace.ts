import type { AgentStep } from "@/shared/services/chat.service"
import {
  parseAskUserPrompt,
  planAskedLines,
  sanitizePlanLine,
  type AskUserPlan,
  type AskUserPrompt,
  type GenerationPreviewStep,
} from "./parse-ask-user"
import { parseToolError, isSilentToolCode } from "./parse-tool-error"
import { TOOL_LABEL_KEY } from "./tool-call-labels"
import { dropSkippedSteps, normalizeAgentSteps } from "./normalize-agent-steps"

export type TraceDoingStatus = "done" | "running" | "pending" | "failed" | "waiting"

export type TraceDoingItem = {
  id: string
  /** Friendly headline (never a raw tool id). */
  labelKey?: string
  labelFallback: string
  /** i18n interpolation, e.g. { channel: "Facebook" }. */
  labelParams?: Record<string, string>
  status: TraceDoingStatus
  /** One-line why (failed / waiting). */
  detail?: string
  /** Muted secondary, e.g. tool id — optional, never the headline. */
  toolName?: string
}

export type TraceThinkingLine = {
  text: string
}

export type DerivedStepTrace = {
  plan: AskUserPlan | null
  thinking: TraceThinkingLine[]
  doing: TraceDoingItem[]
  /** Steps that count toward "N of M". */
  doneCount: number
  totalCount: number
  phase: "working" | "waiting" | "done" | "failed"
  askUser: AskUserPrompt | null
}

const CHANNEL_NAME: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  x: "X",
  twitter: "X",
  youtube: "YouTube",
  threads: "Threads",
  rednote: "RedNote",
  xiaohongshu: "RedNote",
}

function channelName(id: string | undefined | null): string {
  if (!id) return ""
  return CHANNEL_NAME[id.toLowerCase()] ?? id
}

/** Same friendly names as the plan card (Keyword planner, Adapt for Facebook, Image · Facebook, …). */
export function previewStepLabel(step: GenerationPreviewStep): {
  labelKey?: string
  labelFallback: string
  labelParams?: Record<string, string>
} {
  const type = step.type
  const lane = channelName(step.lane)
  if (type === "adapt" && lane) {
    return {
      labelKey: "askUser.preview.nodeType.adaptFor",
      labelFallback: `Adapt for ${lane}`,
      labelParams: { channel: lane },
    }
  }
  if (type === "image_generation" && lane) {
    return {
      labelKey: "askUser.preview.nodeType.imageFor",
      labelFallback: `Image · ${lane}`,
      labelParams: { channel: lane },
    }
  }
  const typeKey = `askUser.preview.nodeType.${type}`
  const fallback = type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  if (lane) {
    return { labelKey: typeKey, labelFallback: `${fallback} · ${lane}`, labelParams: { channel: lane } }
  }
  return { labelKey: typeKey, labelFallback: fallback }
}

function observationForAction(
  steps: AgentStep[],
  actionIndex: number,
  action: Extract<AgentStep, { type: "action" }>,
): Extract<AgentStep, { type: "observation" }> | null {
  const id = action.toolCallId
  for (let i = actionIndex + 1; i < steps.length; i++) {
    const s = steps[i]
    if (s.type !== "observation") continue
    if (id ? s.toolCallId === id : s.name === action.name) return s
  }
  return null
}

function strs(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim()) : []
}

function parsePlanFromResult(result: string): AskUserPlan | null {
  try {
    const parsed: unknown = JSON.parse(result)
    if (!parsed || typeof parsed !== "object") return null
    const obj = parsed as Record<string, unknown>
    const fromAsk = parseAskUserPrompt(result)
    if (fromAsk?.plan) return fromAsk.plan
    const plan = obj.plan
    if (plan && typeof plan === "object") {
      const p = plan as Record<string, unknown>
      let youAskedFor: string | string[] = ""
      if (Array.isArray(p.youAskedFor)) youAskedFor = strs(p.youAskedFor)
      else if (typeof p.youAskedFor === "string") youAskedFor = p.youAskedFor.trim()
      const willChange = strs(p.willChange)
      const notPossible = strs(p.notPossible)
      const emptyAsk = Array.isArray(youAskedFor) ? youAskedFor.length === 0 : !youAskedFor
      if (!emptyAsk || willChange.length || notPossible.length) {
        return { youAskedFor, willChange, notPossible }
      }
    }
    if (obj.brief && typeof obj.brief === "object") {
      const brief = obj.brief as Record<string, unknown>
      const notPossible = strs(brief.notPossible)
      if (notPossible.length) {
        return {
          youAskedFor: typeof brief.topic === "string" ? brief.topic : "",
          willChange: [],
          notPossible,
        }
      }
    }
  } catch {
    // ignore
  }
  return null
}

/** Plain-language thinking — reasons, not a dump of Plan bullets. */
function thinkingFromGapsAndPlan(askUser: AskUserPrompt | null, plan: AskUserPlan | null): TraceThinkingLine[] {
  const lines: TraceThinkingLine[] = []
  const gaps = askUser?.gaps
  const missing = gaps?.missingChannels?.length ? gaps.missingChannels : []

  for (const ch of missing) {
    const name = channelName(ch) || ch
    lines.push({ text: `${name} isn't in your workflow, so I'll add it first.` })
  }
  if (gaps?.missingVideo) {
    lines.push({ text: "Your workflow is missing a video step for the channels that need one." })
  }
  if (gaps?.shared === false && (gaps.channels?.length ?? 0) > 1) {
    lines.push({ text: "Each channel will get its own adapted copy instead of one shared caption." })
  }

  if (plan) {
    for (const w of plan.willChange) {
      const clean = sanitizePlanLine(w)
      if (!clean) continue
      if (missing.some((m) => clean.toLowerCase().includes((channelName(m) || m).toLowerCase()))) continue
      lines.push({ text: clean.endsWith(".") ? clean : `${clean}.` })
    }
  }

  return lines
}

function thinkingFromObservation(name: string, result: string): TraceThinkingLine[] {
  const lines: TraceThinkingLine[] = []
  try {
    const parsed: unknown = JSON.parse(result)
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>
      const code = typeof obj.code === "string" ? obj.code : ""
      if (code === "capability_mismatch" || code === "capability_gap") return lines
      if (code === "preview_confirm") {
        lines.push({ text: "I'll show you the plan before anything runs." })
        return lines
      }
      if (obj.ok === true && name === "start_generation") {
        const refs = typeof obj.referenceImagesUsed === "number" ? obj.referenceImagesUsed : null
        if (refs && refs > 0) {
          lines.push({
            text:
              refs === 1
                ? "I'll use your attached screenshot as a reference."
                : `I'll use your ${refs} attached screenshots as references.`,
          })
        }
      }
      if (obj.ok === true && name === "set_workflow_channels" && Array.isArray(obj.channels)) {
        const ch = (obj.channels as unknown[]).filter((x): x is string => typeof x === "string")
        if (ch.length) lines.push({ text: `Channels set to ${ch.map((c) => channelName(c) || c).join(", ")}.` })
      }
      if (obj.ok === true && (name === "add_workflow_node" || name === "add_workflow_nodes")) {
        const type = typeof obj.type === "string" ? obj.type.replace(/_/g, " ") : "step"
        const lane = typeof obj.lane === "string" ? channelName(obj.lane) || obj.lane : null
        lines.push({ text: lane ? `Added ${type} for ${lane}.` : `Added a ${type}.` })
      }
    }
  } catch {
    // ignore
  }
  const err = parseToolError(name, result)
  if (err && !isSilentToolCode(err.code)) {
    if (err.code === "insufficient_credits") lines.push({ text: "Not enough credits for this step." })
    else if (err.code === "confirmation_required") lines.push({ text: "Waiting for your confirmation before continuing." })
  }
  return lines
}

function friendlyFallback(name: string): string {
  return name.replace(/_/g, " ")
}

/**
 * Derive Plan / Thinking / Doing for the chat steps accordion from existing AgentStep[].
 * No extra LLM call — plan comes from ask_user / capability preflight payloads already on the steps.
 */
export function deriveStepTrace(rawSteps: AgentStep[] | null | undefined): DerivedStepTrace | null {
  if (!rawSteps?.length) return null
  const steps = dropSkippedSteps(normalizeAgentSteps(rawSteps))
  const actions = steps
    .map((s, i) => ({ s, i }))
    .filter((x): x is { s: Extract<AgentStep, { type: "action" }>; i: number } => x.s.type === "action")

  if (actions.length === 0) return null

  let plan: AskUserPlan | null = null
  let askUser: AskUserPrompt | null = null
  const thinking: TraceThinkingLine[] = []
  const thinkingSeen = new Set<string>()

  const pushThink = (line: TraceThinkingLine) => {
    const key = line.text.trim().toLowerCase()
    if (!key || thinkingSeen.has(key)) return
    thinkingSeen.add(key)
    thinking.push(line)
  }

  for (const step of steps) {
    if (step.type !== "observation") continue
    const prompt = parseAskUserPrompt(step.result)
    if (prompt) {
      askUser = prompt
      if (prompt.plan) plan = prompt.plan
    }
    const fromResult = parsePlanFromResult(step.result)
    if (fromResult && !plan) plan = fromResult
    for (const line of thinkingFromObservation(step.name, step.result)) pushThink(line)
  }
  for (const line of thinkingFromGapsAndPlan(askUser, plan)) pushThink(line)

  if (plan && thinking.length === 0) {
    const asked = planAskedLines(plan)
    if (asked.length) pushThink({ text: `You asked for: ${asked.join("; ")}.` })
  }

  const doing: TraceDoingItem[] = actions.map(({ s: action, i }, idx) => {
    const obs = observationForAction(steps, i, action)
    const labelKey = TOOL_LABEL_KEY[action.name]
    const id = action.toolCallId ?? `${action.name}-${idx}`
    if (!obs) {
      return {
        id,
        labelKey,
        labelFallback: friendlyFallback(action.name),
        status: "running" as const,
        toolName: action.name,
      }
    }
    const ask = parseAskUserPrompt(obs.result)
    if (ask) {
      return {
        id,
        labelKey: labelKey ?? "toolCall.askUser",
        labelFallback: "Waiting for your choice",
        status: "waiting" as const,
        detail: "Waiting for your choice",
        toolName: action.name,
      }
    }
    const err = parseToolError(action.name, obs.result)
    if (err && !isSilentToolCode(err.code)) {
      return {
        id,
        labelKey,
        labelFallback: friendlyFallback(action.name),
        status: "failed" as const,
        detail: err.code,
        toolName: action.name,
      }
    }
    return {
      id,
      labelKey,
      labelFallback: friendlyFallback(action.name),
      status: "done" as const,
      toolName: action.name,
    }
  })

  // When waiting on confirm, append planned workflow steps as pending (plan-card friendly names).
  const previewSteps = askUser?.preview?.steps
  if (previewSteps?.length && doing.some((d) => d.status === "waiting")) {
    for (const step of previewSteps) {
      const { labelKey, labelFallback, labelParams } = previewStepLabel(step)
      doing.push({
        id: `preview-${step.nodeId}`,
        labelKey,
        labelFallback,
        labelParams,
        status: "pending",
        detail: step.badge === "adding" ? "Will add" : step.issue || undefined,
      })
    }
  }

  const doneCount = doing.filter((d) => d.status === "done").length
  const totalCount = doing.length
  const hasFailed = doing.some((d) => d.status === "failed")
  const hasWaiting = doing.some((d) => d.status === "waiting")
  const hasRunning = doing.some((d) => d.status === "running")
  const phase: DerivedStepTrace["phase"] = hasFailed
    ? "failed"
    : hasWaiting
      ? "waiting"
      : hasRunning
        ? "working"
        : "done"

  return {
    plan,
    thinking,
    doing,
    doneCount,
    totalCount,
    phase,
    askUser,
  }
}
