import type { PipelineNodeSnapshot } from "@/shared/types/pipeline.type"

const RUNTIME_STATUS_PRIORITY: Record<string, number> = {
  failed_final: 60,
  failed: 58,
  waiting_review: 57,
  completed: 55,
  skipped: 53,
  running: 50,
  streaming: 45,
  processing: 40,
  retrying: 35,
  pending: 5,
  idle: 0,
}

function normalizeLaneKey(lane: string | null | undefined): string {
  return (lane ?? "").trim().toLowerCase()
}

/** Materialized pipeline id (`base__lane`) → template canvas node id (`base`). */
export function materializedNodeIdToCanvasId(materializedId: string): string {
  const sep = "__"
  const idx = materializedId.lastIndexOf(sep)
  if (idx < 0) return materializedId
  return materializedId.slice(0, idx)
}

function runtimeStatusPriority(
  state: Record<string, unknown> | undefined,
): number {
  const status = typeof state?.status === "string" ? state.status : "idle"
  return RUNTIME_STATUS_PRIORITY[status] ?? 0
}

export function mergeRuntimeState(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  if (runtimeStatusPriority(incoming) >= runtimeStatusPriority(existing)) {
    return { ...existing, ...incoming }
  }
  return { ...incoming, ...existing }
}

/** Merge two node runtime maps without regressing higher-priority socket state. */
export function mergePipelineRuntimeMaps(
  existing: Record<string, Record<string, unknown>>,
  incoming: Record<string, Record<string, unknown>>,
): Record<string, Record<string, unknown>> {
  const out = { ...existing }
  for (const [nodeId, state] of Object.entries(incoming)) {
    const prev = out[nodeId]
    out[nodeId] = prev ? mergeRuntimeState(prev, state) : { ...state }
  }
  return out
}

/**
 * Map pipeline execution runtime (materialized node ids) onto workflow template node ids.
 */
export function mapPipelineRuntimeToCanvas(
  pipelineRuntime: Record<string, Record<string, unknown>>,
): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {}
  for (const [materializedId, state] of Object.entries(pipelineRuntime)) {
    const canvasId = materializedNodeIdToCanvasId(materializedId)
    const prev = out[canvasId]
    out[canvasId] = prev ? mergeRuntimeState(prev, state) : { ...state }
  }
  return out
}

/**
 * Resolve a template canvas node id to the executable pipeline node id (for retry/skip APIs).
 */
export function resolveCanvasNodeIdToPipeline(
  canvasNodeId: string,
  pipelineNodes: readonly Pick<PipelineNodeSnapshot, "nodeId" | "lane">[],
  canvasLane?: string | null,
): string {
  const direct = pipelineNodes.find((n) => n.nodeId === canvasNodeId)
  if (direct) return direct.nodeId

  const prefix = `${canvasNodeId}__`
  const candidates = pipelineNodes.filter((n) => n.nodeId.startsWith(prefix))
  if (candidates.length === 0) return canvasNodeId
  if (candidates.length === 1) return candidates[0]!.nodeId

  const laneKey = normalizeLaneKey(canvasLane)
  if (laneKey) {
    const bySuffix = candidates.find((n) => {
      const suffix = n.nodeId.slice(prefix.length)
      return normalizeLaneKey(suffix) === laneKey
    })
    if (bySuffix) return bySuffix.nodeId
    const byLane = candidates.find(
      (n) => normalizeLaneKey(n.lane) === laneKey,
    )
    if (byLane) return byLane.nodeId
  }
  return candidates[0]!.nodeId
}
