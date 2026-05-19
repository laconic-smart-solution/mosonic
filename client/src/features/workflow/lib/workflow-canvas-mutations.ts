import type { Edge } from "@xyflow/react"
import type { Dispatch, SetStateAction } from "react"

import {
  NODE_W,
  PIPE_GAP,
  WF_NODE_TYPES,
  defaultConfigForNewCanvasNode,
  rfNodeTypeForCanvas,
  type WfNodeData,
  type WfRfNode,
} from "@/features/workflow/data/workflow-model"

function workflowNodeData(node: WfRfNode): WfNodeData | null {
  if (node.type === "plus_placeholder") return null
  return node.data
}
import type { BranchChannelHandle } from "@/features/workflow/lib/branch-channels"
import {
  adaptNodesByLane,
  buildLaneEdge,
  channelsMissingAdapt,
  collectBranchCascadeDeleteIds,
  findMergeNode,
  laneAdaptPosition,
  mergeNodePosition,
} from "@/features/workflow/lib/workflow-lane-layout"
import { randomUuid } from "@/lib/random-uuid"

import {
  getBranchSubgraphLaneErrors,
  wouldCreateCycle,
  type ValidationGraphEdge,
  type ValidationGraphNode,
} from "./workflow-node-validation"

export const PLACEHOLDER_NODE_ID = "plus-start"

export function buildPlusEdge(
  source: string,
  target: string,
  handles?: { sourceHandle?: string; targetHandle?: string },
): Edge {
  return buildLaneEdge(source, target, handles)
}

export function createRfNode(
  wfType: string,
  position: { x: number; y: number },
  options?: {
    branchChannels?: BranchChannelHandle[]
    lane?: BranchChannelHandle
  },
): WfRfNode {
  const meta = WF_NODE_TYPES.find((t) => t.type === wfType) ?? WF_NODE_TYPES[0]
  const rfType = rfNodeTypeForCanvas(wfType)
  const lane = options?.lane
  const branchMergeData =
    rfType === "branchNode" || rfType === "mergeNode"
      ? { channelHandles: options?.branchChannels ?? [] }
      : {}
  const laneLabel = lane ? ` (${lane.label})` : ""
  const laneConfig =
    lane && wfType === "adapt"
      ? {
          laneId: lane.id,
          channel: lane.label,
        }
      : lane
        ? { laneId: lane.id }
        : {}
  return {
    id: `n-${randomUuid()}`,
    type: rfType,
    position,
    data: {
      label: `${meta.label}${laneLabel}`,
      wfType,
      status: "idle",
      locked: meta.locked,
      config: { ...defaultConfigForNewCanvasNode(wfType), ...laneConfig },
      lane: lane?.id ?? null,
      ...branchMergeData,
    },
    draggable: !meta.locked,
  } as WfRfNode
}

function positionAfterSource(source: WfRfNode): { x: number; y: number } {
  return {
    x: source.position.x + NODE_W + PIPE_GAP,
    y: source.position.y,
  }
}

function collectDescendants(
  nodeId: string,
  edges: ValidationGraphEdge[],
): Set<string> {
  const out = new Set<string>()
  const queue = [nodeId]
  while (queue.length > 0) {
    const current = queue.shift()!
    for (const edge of edges) {
      if (edge.source === current && !out.has(edge.target)) {
        out.add(edge.target)
        queue.push(edge.target)
      }
    }
  }
  return out
}

export type ReplaceInitialPlaceholderArgs = {
  wfType: string
  setNodes: Dispatch<SetStateAction<WfRfNode[]>>
  branchChannels?: BranchChannelHandle[]
}

export function replaceInitialPlaceholder({
  wfType,
  setNodes,
  branchChannels,
}: ReplaceInitialPlaceholderArgs): WfRfNode {
  const newNode = createRfNode(wfType, { x: 0, y: 0 }, { branchChannels })
  setNodes([newNode])
  return newNode
}

export type SpawnLaneAdaptsArgs = {
  branchId: string
  nodes: WfRfNode[]
  edges: Edge[]
  setNodes: Dispatch<SetStateAction<WfRfNode[]>>
  setEdges: Dispatch<SetStateAction<Edge[]>>
  branchChannels: BranchChannelHandle[]
}

function ensureMergeNode(
  branch: WfRfNode,
  nodes: WfRfNode[],
  branchChannels: BranchChannelHandle[],
): WfRfNode {
  const existing = findMergeNode(nodes)
  if (existing) return existing
  return createRfNode("merge", mergeNodePosition(branch.position), {
    branchChannels,
  })
}

export type DeleteBranchCascadeArgs = {
  branchId: string
  nodes: WfRfNode[]
  edges: Edge[]
  setNodes: Dispatch<SetStateAction<WfRfNode[]>>
  setEdges: Dispatch<SetStateAction<Edge[]>>
}

/** Delete branch, merge, and every lane node in the branch subgraph. */
export function deleteBranchCascade({
  branchId,
  nodes,
  edges,
  setNodes,
  setEdges,
}: DeleteBranchCascadeArgs): void {
  const removeIds = collectBranchCascadeDeleteIds(branchId, nodes, edges)
  setNodes((nds) => nds.filter((n) => !removeIds.has(n.id)))
  setEdges((eds) =>
    eds.filter((e) => !removeIds.has(e.source) && !removeIds.has(e.target)),
  )
}

function adaptHasLane(node: WfRfNode): boolean {
  const d = workflowNodeData(node)
  if (!d) return false
  if (d.lane?.trim()) return true
  const laneId = (d.config as { laneId?: string } | undefined)?.laneId
  return typeof laneId === "string" && laneId.trim().length > 0
}

function unassignedAdaptNodes(nodes: WfRfNode[]): WfRfNode[] {
  return nodes.filter((n) => {
    const d = workflowNodeData(n)
    return d?.wfType === "adapt" && !adaptHasLane(n)
  })
}

export type ApplySpawnLaneAdaptsResult = {
  nodes: WfRfNode[]
  edges: Edge[]
  created: WfRfNode[]
}

/**
 * Pure spawn: remove unassigned adapts, add one adapt per missing channel lane.
 * Same behavior as clicking + Adapt on the Branch node.
 */
export function applySpawnLaneAdapts(
  nodes: WfRfNode[],
  edges: Edge[],
  branchId: string,
  branchChannels: BranchChannelHandle[],
): ApplySpawnLaneAdaptsResult {
  const branch = nodes.find((n) => n.id === branchId)
  if (!branch || branchChannels.length === 0) {
    return { nodes, edges, created: [] }
  }

  const byLane = adaptNodesByLane(nodes)
  const missing = channelsMissingAdapt(branchChannels, byLane)
  if (missing.length === 0) {
    return { nodes, edges, created: [] }
  }

  const legacyAdapt = unassignedAdaptNodes(nodes).filter((n) => n.id !== branchId)
  const removeIds = new Set(legacyAdapt.map((n) => n.id))
  let workingNodes = nodes.filter(
    (n) => n.type !== "plus_placeholder" && !removeIds.has(n.id),
  )
  let workingEdges = edges.filter(
    (e) => !removeIds.has(e.source) && !removeIds.has(e.target),
  )

  const merge = ensureMergeNode(branch, workingNodes, branchChannels)
  const mergeWasNew = !findMergeNode(workingNodes)
  const created: WfRfNode[] = mergeWasNew ? [merge] : []
  if (mergeWasNew) {
    workingNodes = [...workingNodes, merge]
  }
  const newEdges: Edge[] = []

  missing.forEach((ch) => {
    const index = branchChannels.findIndex((c) => c.id === ch.id)
    const adapt = createRfNode(
      "adapt",
      laneAdaptPosition(branch.position, index, branchChannels.length),
      { branchChannels, lane: ch },
    )
    created.push(adapt)
    workingNodes = [...workingNodes, adapt]
    newEdges.push(
      buildLaneEdge(branchId, adapt.id, { sourceHandle: ch.id }),
    )
    newEdges.push(
      buildLaneEdge(adapt.id, merge.id, { targetHandle: ch.id }),
    )
  })

  const validationNodes: ValidationGraphNode[] = workingNodes.map((n) => {
    const d = workflowNodeData(n)
    return {
      id: n.id,
      data: { wfType: d?.wfType ?? "", lane: d?.lane },
    }
  })
  const validationEdges = workingEdges.map((e) => ({
    source: e.source,
    target: e.target,
  }))

  for (const edge of newEdges) {
    if (wouldCreateCycle(validationNodes, validationEdges, edge.source, edge.target)) {
      return { nodes, edges, created: [] }
    }
    validationEdges.push({ source: edge.source, target: edge.target })
    validationNodes.push({
      id: edge.target,
      data: { wfType: "adapt", lane: edge.targetHandle ?? null },
    })
  }

  return {
    nodes: workingNodes,
    edges: [...workingEdges, ...newEdges],
    created,
  }
}

export type RepairOrphanLaneAdaptsResult = {
  nodes: WfRfNode[]
  edges: Edge[]
  repaired: boolean
}

/**
 * Option 1 fix: drop unassigned Adapt nodes in the branch subgraph, then spawn
 * one Adapt per channel from Branch (same as + on Branch).
 */
export function repairOrphanLaneAdapts(
  nodes: WfRfNode[],
  edges: Edge[],
  branchChannels: BranchChannelHandle[],
): RepairOrphanLaneAdaptsResult {
  if (branchChannels.length < 2) {
    return { nodes, edges, repaired: false }
  }

  const laneErrors = getBranchSubgraphLaneErrors(
    nodes,
    edges,
    branchChannels.length,
  )
  const hasAdaptLaneError = laneErrors.some((e) => e.startsWith("Adapt "))
  if (!hasAdaptLaneError) {
    return { nodes, edges, repaired: false }
  }

  const branch = nodes.find(
    (n) => n.type === "branchNode" || workflowNodeData(n)?.wfType === "branch",
  )
  if (!branch) {
    return { nodes, edges, repaired: false }
  }

  const removeIds = new Set(unassignedAdaptNodes(nodes).map((n) => n.id))
  if (removeIds.size === 0) {
    return { nodes, edges, repaired: false }
  }

  const strippedNodes = nodes.filter(
    (n) => n.type !== "plus_placeholder" && !removeIds.has(n.id),
  )
  const strippedEdges = edges.filter(
    (e) => !removeIds.has(e.source) && !removeIds.has(e.target),
  )

  const { nodes: nextNodes, edges: nextEdges } = applySpawnLaneAdapts(
    strippedNodes,
    strippedEdges,
    branch.id,
    branchChannels,
  )

  return { nodes: nextNodes, edges: nextEdges, repaired: true }
}

/** Create one adapt node per channel lane with branch→adapt→merge edges. */
export function spawnLaneAdapts({
  branchId,
  nodes,
  edges,
  setNodes,
  setEdges,
  branchChannels,
}: SpawnLaneAdaptsArgs): WfRfNode[] {
  const { nodes: nextNodes, edges: nextEdges, created } = applySpawnLaneAdapts(
    nodes,
    edges,
    branchId,
    branchChannels,
  )
  if (created.length === 0) return []

  setNodes(nextNodes)
  setEdges(nextEdges)
  return created
}

export type AddNodeAfterArgs = {
  sourceId: string
  wfType: string
  nodes: WfRfNode[]
  edges: Edge[]
  setNodes: Dispatch<SetStateAction<WfRfNode[]>>
  setEdges: Dispatch<SetStateAction<Edge[]>>
  branchChannels?: BranchChannelHandle[]
}

export function addNodeAfter({
  sourceId,
  wfType,
  nodes,
  edges,
  setNodes,
  setEdges,
  branchChannels = [],
}: AddNodeAfterArgs): WfRfNode | null {
  const source = nodes.find((n) => n.id === sourceId)
  if (!source) return null
  const sourceData = workflowNodeData(source)
  if (!sourceData) return null

  if (source.type === "branchNode" && wfType === "adapt") {
    const created = spawnLaneAdapts({
      branchId: sourceId,
      nodes,
      edges,
      setNodes,
      setEdges,
      branchChannels,
    })
    return created[0] ?? null
  }

  const validationNodes: ValidationGraphNode[] = nodes
    .filter((n) => n.type !== "plus_placeholder")
    .map((n) => {
      const d = workflowNodeData(n)
      return {
        id: n.id,
        data: { wfType: d?.wfType ?? "", lane: d?.lane },
      }
    })
  const validationEdges = edges.map((e) => ({
    source: e.source,
    target: e.target,
  }))

  const laneHandle = sourceData.lane
    ? branchChannels.find((ch) => ch.id === sourceData.lane)
    : undefined

  const newNode = createRfNode(
    wfType,
    positionAfterSource(source),
    { branchChannels, lane: laneHandle },
  )

  if (
    wouldCreateCycle(validationNodes, validationEdges, sourceId, newNode.id)
  ) {
    return null
  }

  const merge = wfType === "merge" ? undefined : findMergeNode(nodes)
  const laneId = sourceData.lane?.trim()
  const mergeEdge =
    merge && laneId
      ? edges.find(
          (e) =>
            e.source === sourceId &&
            e.target === merge.id &&
            e.targetHandle === laneId,
        )
      : undefined

  setNodes((nds) => [...nds.filter((n) => n.type !== "plus_placeholder"), newNode])
  setEdges((eds) => {
    let next = mergeEdge != null ? eds.filter((e) => e.id !== mergeEdge.id) : eds
    next = [...next, buildPlusEdge(sourceId, newNode.id)]
    if (merge && laneId) {
      next = [
        ...next,
        buildLaneEdge(newNode.id, merge.id, { targetHandle: laneId }),
      ]
    }
    return next
  })

  return newNode
}

export type InsertNodeBetweenArgs = {
  edgeId: string
  wfType: string
  nodes: WfRfNode[]
  edges: Edge[]
  setNodes: Dispatch<SetStateAction<WfRfNode[]>>
  setEdges: Dispatch<SetStateAction<Edge[]>>
  branchChannels?: BranchChannelHandle[]
}

export function insertNodeBetween({
  edgeId,
  wfType,
  nodes,
  edges,
  setNodes,
  setEdges,
  branchChannels,
}: InsertNodeBetweenArgs): WfRfNode | null {
  const edge = edges.find((e) => e.id === edgeId)
  if (!edge?.source || !edge.target) return null

  const source = nodes.find((n) => n.id === edge.source)
  const target = nodes.find((n) => n.id === edge.target)
  if (!source || !target) return null
  const sourceData = workflowNodeData(source)
  const targetData = workflowNodeData(target)
  if (!sourceData) return null

  const validationNodes: ValidationGraphNode[] = nodes
    .filter((n) => n.type !== "plus_placeholder")
    .map((n) => {
      const d = workflowNodeData(n)
      return {
        id: n.id,
        data: { wfType: d?.wfType ?? "", lane: d?.lane },
      }
    })
  const validationEdges = edges
    .filter((e) => e.id !== edgeId)
    .map((e) => ({ source: e.source, target: e.target }))

  const insertX = (source.position.x + target.position.x) / 2
  const insertY = (source.position.y + target.position.y) / 2

  const laneId = sourceData.lane?.trim() || targetData?.lane?.trim()
  const laneHandle = laneId
    ? branchChannels?.find((ch) => ch.id === laneId)
    : undefined

  const newNode = createRfNode(
    wfType,
    { x: insertX, y: insertY },
    { branchChannels, lane: laneHandle },
  )

  if (
    wouldCreateCycle(validationNodes, validationEdges, edge.source, newNode.id) ||
    wouldCreateCycle(
      validationNodes,
      [...validationEdges, { source: edge.source, target: newNode.id }],
      newNode.id,
      edge.target,
    )
  ) {
    return null
  }

  const shiftX = NODE_W + PIPE_GAP
  const toShift = collectDescendants(edge.target, validationEdges)
  toShift.add(edge.target)

  setNodes((nds) => {
    const filtered = nds.filter((n) => n.type !== "plus_placeholder")
    const shifted = filtered.map((n) =>
      toShift.has(n.id)
        ? { ...n, position: { ...n.position, x: n.position.x + shiftX } }
        : n,
    )
    return [...shifted, newNode]
  })

  setEdges((eds) => {
    const rest = eds.filter((e) => e.id !== edgeId)
    return [
      ...rest,
      buildPlusEdge(edge.source, newNode.id),
      buildPlusEdge(newNode.id, edge.target),
    ]
  })

  return newNode
}
