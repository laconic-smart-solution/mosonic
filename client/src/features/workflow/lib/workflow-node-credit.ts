import { canvasTypeToBackend } from "@/features/workflow/data/workflow-model"
import { effectiveVideoMode } from "@/features/workflow/lib/video-generation-ui"
import type { PipelineEstimateBreakdownItem } from "@/shared/types/pipeline.type"

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
): Record<string, number> {
  const map: Record<string, number> = {}
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
