import type { PipelineNodeSnapshot } from "@/shared/types/pipeline.type"
import type { WorkflowNode, WorkflowNodeType } from "@/shared/types/workflow.type"

const SKIP_GENERATION_TYPES = new Set<WorkflowNodeType>([
  "keyword_planner",
  "intelligence",
  "branch",
  "merge",
])

function isSkippableType(type: WorkflowNodeType): boolean {
  return SKIP_GENERATION_TYPES.has(type)
}

function templateNodeIdBase(nodeId: string, lanes?: string[]): string {
  const sep = nodeId.lastIndexOf("__")
  if (sep >= 0) return nodeId.slice(0, sep)
  if (lanes?.length) {
    const sorted = [...lanes].sort((a, b) => b.length - a.length)
    for (const lane of sorted) {
      const suffix = `_${lane}`
      if (
        nodeId.length > suffix.length &&
        nodeId.toLowerCase().endsWith(suffix.toLowerCase())
      ) {
        return nodeId.slice(0, -suffix.length)
      }
    }
  }
  return nodeId
}

export function resolveNodeConfigSource(
  nodeId: string,
  workflowNodes: WorkflowNode[],
  pipelineNodes?: PipelineNodeSnapshot[],
): WorkflowNode | undefined {
  const direct = workflowNodes.find((n) => n.nodeId === nodeId)
  if (direct) return direct

  const lanes = [
    ...new Set(
      (pipelineNodes ?? [])
        .map((n) => n.lane?.trim())
        .filter((lane): lane is string => Boolean(lane)),
    ),
  ]
  const base = templateNodeIdBase(nodeId, lanes)
  const template = workflowNodes.find((n) => n.nodeId === base)
  const pipelineNode = pipelineNodes?.find((n) => n.nodeId === nodeId)
  if (!template && !pipelineNode) return undefined

  return {
    ...(template ?? {
      nodeId,
      type: (pipelineNode?.type as WorkflowNodeType) ?? "text_generation",
      order: pipelineNode?.order ?? 0,
      isLocked: false,
    }),
    nodeId,
    config: {
      ...(template?.config ?? {}),
      ...(pipelineNode?.config ?? {}),
    },
  }
}

function inferTypeFromOutputLayer(
  layer: Record<string, unknown>,
): WorkflowNodeType | null {
  if (typeof layer.image === "string" && layer.image.trim()) {
    return "image_generation"
  }
  if (typeof layer.video === "string" && layer.video.trim()) {
    return "video_generation"
  }
  if (typeof layer.translatedText === "string" && layer.translatedText.trim()) {
    return "translation"
  }
  if (typeof layer.transcription === "string" && layer.transcription.trim()) {
    return "transcription"
  }
  if (typeof layer.summary === "string" && layer.summary.trim()) {
    return "summarization"
  }
  if (typeof layer.text === "string" && layer.text.trim()) {
    return "text_generation"
  }
  if (typeof layer.keywords === "string" && layer.keywords.trim()) {
    return "keyword_planner"
  }
  return null
}

function inferTypeFromMaterializedId(
  nodeId: string,
  workflowNodes: WorkflowNode[],
): WorkflowNodeType | null {
  const base = templateNodeIdBase(nodeId)
  const match = workflowNodes.find((n) => n.nodeId === base)
  if (match) return match.type
  const direct = workflowNodes.find((n) => n.nodeId === nodeId)
  if (direct) return direct.type
  const laneSuffix = nodeId.includes("__") ? nodeId.slice(nodeId.lastIndexOf("__") + 2) : null
  if (laneSuffix) {
    const byLane = workflowNodes.find(
      (n) =>
        n.type === "adapt" &&
        typeof n.config?.laneId === "string" &&
        n.config.laneId === laneSuffix,
    )
    if (byLane) return byLane.type
  }
  return null
}

function pipelineNodeToWorkflowNode(node: PipelineNodeSnapshot): WorkflowNode {
  return {
    nodeId: node.nodeId,
    type: node.type,
    order: node.order,
    isLocked: node.isLocked,
    config: {
      ...node.config,
      ...(node.lane ? { laneId: node.lane } : {}),
    },
  }
}

function isTemplateParentOfMaterialized(
  workflowNodeId: string,
  pipelineNodeIds: Iterable<string>,
): boolean {
  for (const pipelineId of pipelineNodeIds) {
    if (templateNodeIdBase(pipelineId) === workflowNodeId) return true
  }
  return false
}

function workflowNodeFromOutputKey(
  nodeId: string,
  workflowNodes: WorkflowNode[],
  layer: Record<string, unknown>,
  index: number,
): WorkflowNode | null {
  const type =
    inferTypeFromMaterializedId(nodeId, workflowNodes) ??
    inferTypeFromOutputLayer(layer)
  if (!type || isSkippableType(type)) return null
  const lane = nodeId.includes("__")
    ? nodeId.slice(nodeId.lastIndexOf("__") + 2)
    : null
  const template = workflowNodes.find((n) => n.nodeId === templateNodeIdBase(nodeId))
  const direct = workflowNodes.find((n) => n.nodeId === nodeId)
  return {
    nodeId,
    type,
    order: direct?.order ?? template?.order ?? index + 1,
    isLocked: false,
    config: direct?.config ?? (lane ? { laneId: lane } : template?.config),
  }
}

function mergePipelineWithExtras(
  pipelineNodes: PipelineNodeSnapshot[],
  workflowNodes: WorkflowNode[],
  nodeOutputs: Record<string, Record<string, unknown>>,
): WorkflowNode[] {
  const pipelineCards = pipelineNodes
    .filter((n) => !isSkippableType(n.type))
    .map(pipelineNodeToWorkflowNode)

  const byId = new Map<string, WorkflowNode>()
  for (const card of pipelineCards) {
    byId.set(card.nodeId, card)
  }

  const pipelineIds = pipelineCards.map((n) => n.nodeId)

  for (const wf of workflowNodes) {
    if (isSkippableType(wf.type)) continue
    if (byId.has(wf.nodeId)) continue
    if (isTemplateParentOfMaterialized(wf.nodeId, pipelineIds)) continue
    byId.set(wf.nodeId, wf)
  }

  Object.entries(nodeOutputs).forEach(([nodeId, layer], index) => {
    if (byId.has(nodeId)) return
    const node = workflowNodeFromOutputKey(nodeId, workflowNodes, layer, index)
    if (node) byId.set(nodeId, node)
  })

  return [...byId.values()].sort((a, b) => a.order - b.order)
}

/**
 * Cards for the upload generation panel: materialized pipeline nodes (keys match
 * content.nodeOutputs) plus workflow-only nodes (e.g. Generate more appends).
 */
export function buildGenerationNodesForContent(
  pipelineNodes: PipelineNodeSnapshot[] | undefined,
  workflowNodes: WorkflowNode[],
  nodeOutputs: Record<string, Record<string, unknown>>,
): WorkflowNode[] {
  if (pipelineNodes && pipelineNodes.length > 0) {
    return mergePipelineWithExtras(pipelineNodes, workflowNodes, nodeOutputs)
  }

  const outputIds = Object.keys(nodeOutputs)
  if (outputIds.length > 0) {
    const fromOutputs: WorkflowNode[] = []
    outputIds.forEach((nodeId, index) => {
      const node = workflowNodeFromOutputKey(
        nodeId,
        workflowNodes,
        nodeOutputs[nodeId] ?? {},
        index,
      )
      if (node) fromOutputs.push(node)
    })
    return fromOutputs.sort((a, b) => a.order - b.order)
  }

  return workflowNodes
    .filter((n) => !isSkippableType(n.type))
    .sort((a, b) => a.order - b.order)
}
