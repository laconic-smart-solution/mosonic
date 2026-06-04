import {
  mergeNodeOutputLayers,
  outputKeyForNodeType,
  type OutputKey,
} from "@/features/content/data/content-review-helpers"
import type { CardRunState } from "@/features/content/components/content-detail/content-detail-review-ui"
import { normalizeChannelKey } from "@/features/upload/lib/upload-platform-media"
import type { PipelineNodeSnapshot } from "@/shared/types/pipeline.type"
import type { WorkflowNode } from "@/shared/types/workflow.type"

export type GenerationLaneFilter = "all" | (string & {})

export function laneSuffixFromNodeId(nodeId: string): string | null {
  const idx = nodeId.lastIndexOf("__")
  if (idx < 0) return null
  const suffix = nodeId.slice(idx + 2).trim()
  return suffix.length > 0 ? suffix : null
}

export function lanesMatch(a: string, b: string): boolean {
  const na = normalizeChannelKey(a)
  const nb = normalizeChannelKey(b)
  if (na === nb) return true
  const twitterFamily = new Set(["twitter", "x"])
  return twitterFamily.has(na) && twitterFamily.has(nb)
}

/** Lane id for a generation card (pipeline lane, config.laneId, or materialized id suffix). */
export function resolveNodeLane(
  node: WorkflowNode,
  pipelineNode?: PipelineNodeSnapshot | null,
): string | null {
  const fromPipeline = pipelineNode?.lane?.trim()
  if (fromPipeline) return normalizeChannelKey(fromPipeline)

  const configLane = (node.config as { laneId?: string } | undefined)?.laneId
  if (typeof configLane === "string" && configLane.trim()) {
    return normalizeChannelKey(configLane)
  }

  const suffix = laneSuffixFromNodeId(node.nodeId)
  if (suffix) return normalizeChannelKey(suffix)

  return null
}

export function textFromLayer(layer: Record<string, unknown>): string {
  const text =
    typeof layer.text === "string" ? layer.text.trim() : ""
  if (text) return text
  const adapted =
    typeof layer.adaptedCaption === "string" ? layer.adaptedCaption.trim() : ""
  return adapted
}

export function staticTextFromLayer(
  layer: Record<string, unknown>,
  key: OutputKey,
): string {
  switch (key) {
    case "keywords":
      return typeof layer.keywords === "string" ? layer.keywords : ""
    case "text":
      return textFromLayer(layer)
    case "translatedText":
      return typeof layer.translatedText === "string" ? layer.translatedText : ""
    case "transcription":
      return typeof layer.transcription === "string" ? layer.transcription : ""
    case "summary":
      return typeof layer.summary === "string" ? layer.summary : ""
    default:
      return ""
  }
}

function isActiveRun(run: CardRunState | undefined): boolean {
  if (!run) return false
  return (
    run.phase === "running" ||
    run.phase === "streaming" ||
    run.phase === "processing" ||
    run.phase === "retrying"
  )
}

export function hasDisplayableNodeOutput(
  node: WorkflowNode,
  nodeOutputs: Record<string, Record<string, unknown>>,
  nodeUserEdits: Record<string, Record<string, unknown>>,
  run?: CardRunState,
  pipelineNode?: PipelineNodeSnapshot | null,
): boolean {
  if (isActiveRun(run)) return true

  const layer = mergeNodeOutputLayers(nodeOutputs, nodeUserEdits, node.nodeId)

  if (pipelineNode?.output && typeof pipelineNode.output === "object") {
    const snap = pipelineNode.output as Record<string, unknown>
    if (node.type === "adapt") {
      if (textFromLayer(snap)) return true
    } else {
      const key = outputKeyForNodeType(node.type)
      if (key === "image" && typeof snap.image === "string" && snap.image.trim()) {
        return true
      }
      if (key === "video" && typeof snap.video === "string" && snap.video.trim()) {
        return true
      }
      if (key && staticTextFromLayer(snap, key).trim()) return true
    }
  }

  if (node.type === "adapt") {
    return textFromLayer(layer).length > 0
  }

  const key = outputKeyForNodeType(node.type)
  if (!key) return false
  if (key === "image") {
    return typeof layer.image === "string" && layer.image.trim().length > 0
  }
  if (key === "video") {
    return typeof layer.video === "string" && layer.video.trim().length > 0
  }
  return staticTextFromLayer(layer, key).trim().length > 0
}

export type FilterGenerationNodesOptions = {
  filterKey: GenerationLaneFilter
  pipelineNodes?: PipelineNodeSnapshot[]
  nodeOutputs: Record<string, Record<string, unknown>>
  nodeUserEdits: Record<string, Record<string, unknown>>
  runByNodeId?: Partial<Record<string, CardRunState>>
  /** When true, trunk nodes (no lane) appear on every channel tab. Default true. */
  includeSharedTrunkInChannelTabs?: boolean
}

export function filterGenerationNodesForChannel(
  nodes: WorkflowNode[],
  options: FilterGenerationNodesOptions,
): WorkflowNode[] {
  const {
    filterKey,
    pipelineNodes,
    nodeOutputs,
    nodeUserEdits,
    runByNodeId,
    includeSharedTrunkInChannelTabs = true,
  } = options

  const pipelineById = new Map(
    (pipelineNodes ?? []).map((n) => [n.nodeId, n] as const),
  )

  return nodes.filter((node) => {
    const pipelineNode = pipelineById.get(node.nodeId)
    const run = runByNodeId?.[node.nodeId]

    if (
      !hasDisplayableNodeOutput(
        node,
        nodeOutputs,
        nodeUserEdits,
        run,
        pipelineNode,
      )
    ) {
      return false
    }

    if (filterKey === "all") return true

    const lane = resolveNodeLane(node, pipelineNode)
    if (lane === null) {
      return includeSharedTrunkInChannelTabs
    }
    return lanesMatch(lane, filterKey)
  })
}

export function generationLaneTabLabel(
  key: GenerationLaneFilter,
  channelDisplayName?: string,
): string {
  if (key === "all") return "All"
  return channelDisplayName ?? key
}
