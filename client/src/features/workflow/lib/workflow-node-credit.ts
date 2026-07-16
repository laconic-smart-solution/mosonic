import { canvasTypeToBackend } from "@/features/workflow/data/workflow-model"
import { effectiveVideoMode } from "@/features/workflow/lib/video-generation-ui"
import type {
  PipelineEstimateBreakdownItem,
  PipelineEstimateResponse,
} from "@/shared/types/pipeline.type"

/** Billable credit catalog key for a canvas node, or null for free structure nodes. */
export function resolveWfNodeCreditKey(
  wfType: string,
  config?: Record<string, unknown>,
): string | null {
  if (wfType === "branch" || wfType === "merge") return null
  const backend = canvasTypeToBackend(wfType)
  if (backend === "video_generation") {
    return effectiveVideoMode(config) === "presenter"
      ? "video_generation_presenter"
      : "video_generation_cinematic"
  }
  return backend
}

export function buildCreditEachByKey(
  breakdown: PipelineEstimateBreakdownItem[] | undefined,
  unitCredits?: Record<string, number>,
): Record<string, number> {
  const map: Record<string, number> = { ...(unitCredits ?? {}) }
  for (const item of breakdown ?? []) {
    if (item.creditsEach > 0) {
      map[item.nodeType] = item.creditsEach
    }
  }
  return map
}

export function creditCostForWfNode(
  wfType: string,
  config: Record<string, unknown> | undefined,
  creditEachByKey: Record<string, number>,
): number | undefined {
  const key = resolveWfNodeCreditKey(wfType, config)
  if (!key) return undefined
  const credits = creditEachByKey[key]
  return typeof credits === "number" && credits > 0 ? credits : undefined
}

export type CanvasCreditNodeInput = {
  type?: string
  /** Heterogeneous RF node data; only `wfType` / `config` are read when present. */
  data: unknown
}

function readWfCreditFields(data: unknown): {
  wfType?: string
  config?: Record<string, unknown>
} {
  if (!data || typeof data !== "object") return {}
  const record = data as Record<string, unknown>
  return {
    wfType: typeof record.wfType === "string" ? record.wfType : undefined,
    config:
      record.config && typeof record.config === "object"
        ? (record.config as Record<string, unknown>)
        : undefined,
  }
}

/**
 * Live run-cost from current canvas nodes (not the last saved workflow snapshot).
 */
export function estimateCreditsFromCanvasNodes(
  nodes: CanvasCreditNodeInput[],
  creditEachByKey: Record<string, number>,
  creditsRemaining: number,
): PipelineEstimateResponse {
  const counts = new Map<string, number>()

  for (const node of nodes) {
    if (node.type === "plus_placeholder") continue
    const { wfType, config } = readWfCreditFields(node.data)
    if (!wfType) continue
    const key = resolveWfNodeCreditKey(wfType, config)
    if (!key) continue
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const breakdown: PipelineEstimateBreakdownItem[] = []
  let totalCredits = 0

  for (const [nodeType, count] of counts) {
    const creditsEach = creditEachByKey[nodeType] ?? 0
    const creditsTotal = creditsEach * count
    totalCredits += creditsTotal
    breakdown.push({ nodeType, count, creditsEach, creditsTotal })
  }

  breakdown.sort((a, b) => a.nodeType.localeCompare(b.nodeType))

  return {
    totalCredits,
    breakdown,
    unitCredits: creditEachByKey,
    creditsRemaining,
    sufficient: creditsRemaining >= totalCredits,
  }
}
