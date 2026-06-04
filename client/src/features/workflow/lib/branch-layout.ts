import type { Edge } from "@xyflow/react"

import {
  NODE_W,
  PIPE_GAP,
  WF_NODE_TYPES,
  backendTypeToCanvas,
  rfNodeTypeForCanvas,
  type NodeStatus,
  type WfRfNode,
} from "@/features/workflow/data/workflow-model"
import type { BranchChannelHandle } from "@/features/workflow/lib/branch-channels"
import { formatLaneNodeLabel } from "@/features/workflow/lib/lane-node-label"
import { channelLabel } from "@/shared/constants/distribution-channels"
import type { PipelineNodeSnapshot } from "@/shared/types/pipeline.type"
import type { WorkflowEdge, WorkflowNode } from "@/shared/types/workflow.type"

const LANE_GAP = 140
const CENTER_Y = 140
const PREVIEW_EDGE_PREFIX = "preview-"

const LANE_COLORS = [
  "#0D9488",
  "#6366F1",
  "#9333EA",
  "#EA580C",
  "#2563EB",
  "#DC2626",
]

function laneColor(index: number): string {
  return LANE_COLORS[index % LANE_COLORS.length]!
}

export function isPreviewEdgeId(id: string): boolean {
  return id.startsWith(PREVIEW_EDGE_PREFIX)
}

function collectReachable(
  edges: WorkflowEdge[],
  startId: string,
  stopId: string,
): Set<string> {
  const subgraph = new Set<string>()
  const queue = edges.filter((e) => e.from === startId).map((e) => e.to)
  while (queue.length > 0) {
    const current = queue.shift()!
    if (current === stopId || subgraph.has(current)) continue
    subgraph.add(current)
    for (const edge of edges) {
      if (edge.from === current && edge.to !== stopId) {
        queue.push(edge.to)
      }
    }
  }
  return subgraph
}

/**
 * Synthetic fan-out / fan-in edges for edit-mode preview (not persisted).
 */
export function buildBranchPreviewEdges(
  nodes: Array<{ id: string; data: { wfType: string } }>,
  edges: Edge[],
  channels: BranchChannelHandle[],
  showPreview: boolean,
): Edge[] {
  if (!showPreview || channels.length === 0) return []

  const branch = nodes.find((n) => n.data.wfType === "branch")
  const merge = nodes.find((n) => n.data.wfType === "merge")
  if (!branch || !merge) return []

  const workflowEdges: WorkflowEdge[] = edges
    .filter((e) => !isPreviewEdgeId(e.id))
    .map((e) => ({ from: e.source, to: e.target }))

  const subgraphIds = collectReachable(workflowEdges, branch.id, merge.id)
  const laneTarget =
    nodes.find(
      (n) => subgraphIds.has(n.id) && n.data.wfType === "adapt",
    ) ??
    nodes.find((n) => subgraphIds.has(n.id)) ??
    null
  if (!laneTarget) return []

  const preview: Edge[] = []
  channels.forEach((ch, index) => {
    const color = laneColor(index)
    const style = { stroke: color, strokeWidth: 2 }
    preview.push({
      id: `${PREVIEW_EDGE_PREFIX}${branch.id}-${ch.id}-to-${laneTarget.id}`,
      source: branch.id,
      sourceHandle: ch.id,
      target: laneTarget.id,
      type: "smoothstep",
      animated: true,
      label: ch.label,
      labelStyle: { fontSize: 10, fill: color },
      style,
    })
    preview.push({
      id: `${PREVIEW_EDGE_PREFIX}${laneTarget.id}-${ch.id}-to-${merge.id}`,
      source: laneTarget.id,
      target: merge.id,
      targetHandle: ch.id,
      type: "smoothstep",
      animated: true,
      label: ch.label,
      labelStyle: { fontSize: 10, fill: color },
      style,
    })
  })
  return preview
}

export type PipelineGraphInput = {
  nodes: PipelineNodeSnapshot[]
  edges: WorkflowEdge[]
  lanes: string[]
  /** Materialized nodeId → position from workflow template at pipeline start. */
  layout?: Record<string, { x: number; y: number }>
}

function topologicalOrder(nodeIds: string[], edges: WorkflowEdge[]): string[] {
  const indegree = new Map(nodeIds.map((id) => [id, 0]))
  const outgoing = new Map(nodeIds.map((id) => [id, [] as string[]]))
  for (const edge of edges) {
    if (!indegree.has(edge.from) || !indegree.has(edge.to)) continue
    outgoing.get(edge.from)!.push(edge.to)
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1)
  }
  const queue = nodeIds.filter((id) => (indegree.get(id) ?? 0) === 0)
  const ordered: string[] = []
  while (queue.length > 0) {
    const current = queue.shift()!
    ordered.push(current)
    for (const next of outgoing.get(current) ?? []) {
      const deg = (indegree.get(next) ?? 0) - 1
      indegree.set(next, deg)
      if (deg === 0) queue.push(next)
    }
  }
  return ordered.length === nodeIds.length ? ordered : nodeIds
}

function laneLabel(node: PipelineNodeSnapshot): string | null {
  if (node.lane?.trim()) return node.lane.trim()
  const sep = node.nodeId.lastIndexOf("__")
  if (sep >= 0) return node.nodeId.slice(sep + 2)
  return null
}

function readLayoutPosition(
  layout: Record<string, { x: number; y: number }>,
  nodeId: string,
): { x: number; y: number } | null {
  const saved = layout[nodeId]
  if (
    saved &&
    typeof saved.x === "number" &&
    Number.isFinite(saved.x) &&
    typeof saved.y === "number" &&
    Number.isFinite(saved.y)
  ) {
    return { x: saved.x, y: saved.y }
  }
  return null
}

function hasCompletePersistedLayout(
  snapNodes: PipelineNodeSnapshot[],
  layout: Record<string, { x: number; y: number }>,
): boolean {
  if (snapNodes.length === 0) return false
  return snapNodes.every((n) => readLayoutPosition(layout, n.nodeId) != null)
}

function buildPipelineAutoPositions(
  snapNodes: PipelineNodeSnapshot[],
  snapEdges: WorkflowEdge[],
  lanes: string[],
): Map<string, { x: number; y: number }> {
  const trunk = snapNodes.filter((n) => !n.lane?.trim())
  const laneOrder =
    lanes.length > 0
      ? lanes
      : [...new Set(snapNodes.map(laneLabel).filter(Boolean) as string[])]

  const trunkIds = trunk.map((n) => n.nodeId)
  const trunkOrdered = topologicalOrder(trunkIds, snapEdges)

  const positionById = new Map<string, { x: number; y: number }>()
  trunkOrdered.forEach((id, i) => {
    positionById.set(id, {
      x: 80 + i * (NODE_W + PIPE_GAP),
      y: CENTER_Y,
    })
  })

  laneOrder.forEach((lane, laneIndex) => {
    const laneNodes = snapNodes.filter(
      (n) =>
        normalizeLaneKey(n.lane) === normalizeLaneKey(lane) ||
        normalizeLaneKey(laneLabel(n)) === normalizeLaneKey(lane),
    )
    const laneIds = laneNodes.map((n) => n.nodeId)
    const laneEdges = snapEdges.filter(
      (e) => laneIds.includes(e.from) && laneIds.includes(e.to),
    )
    const ordered = topologicalOrder(laneIds, laneEdges)
    const y = CENTER_Y + (laneIndex - (laneOrder.length - 1) / 2) * LANE_GAP
    ordered.forEach((id, i) => {
      const trunkX =
        positionById.get(trunkOrdered[trunkOrdered.length - 1] ?? "")?.x ?? 80
      positionById.set(id, {
        x: trunkX + 80 + (i + 1) * (NODE_W + PIPE_GAP * 0.6),
        y,
      })
    })
  })

  return positionById
}

/**
 * Materialized pipeline → React Flow nodes/edges (fallback when template is unavailable).
 */
export function pipelineGraphToRf(input: PipelineGraphInput): {
  nodes: WfRfNode[]
  edges: Edge[]
} {
  const { nodes: snapNodes, edges: snapEdges, lanes, layout = {} } = input
  const usePersistedOnly = hasCompletePersistedLayout(snapNodes, layout)
  const autoPositions = usePersistedOnly
    ? null
    : buildPipelineAutoPositions(snapNodes, snapEdges, lanes)

  const extraLayoutNodes: WfRfNode[] = []
  for (const [nodeId, pos] of Object.entries(layout)) {
    if (snapNodes.some((n) => n.nodeId === nodeId)) continue
    if (!readLayoutPosition(layout, nodeId)) continue
    extraLayoutNodes.push({
      id: nodeId,
      type: "branchNode",
      position: pos,
      data: {
        label: "Branch",
        wfType: "branch",
        status: "idle",
        locked: true,
        config: { mode: "rule_channels" },
        channelHandles: [],
      },
      draggable: false,
    })
  }

  const rfNodes: WfRfNode[] = snapNodes.map((n) => {
    const canvasType = backendTypeToCanvas(n.type)
    const meta = WF_NODE_TYPES.find((t) => t.type === canvasType) ?? WF_NODE_TYPES[0]
    const rfType = rfNodeTypeForCanvas(canvasType)
    const saved = readLayoutPosition(layout, n.nodeId)
    const autoPos = autoPositions?.get(n.nodeId) ?? { x: 80, y: CENTER_Y }
    const pos = saved ?? autoPos
    const lane = laneLabel(n)
    const displayChannel = lane ? channelLabel(lane) : null
    const branchMergeData =
      rfType === "branchNode" || rfType === "mergeNode"
        ? { channelHandles: [] as BranchChannelHandle[] }
        : {}
    return {
      id: n.nodeId,
      type: rfType,
      position: pos,
      data: {
        label: displayChannel
          ? formatLaneNodeLabel(canvasType, displayChannel)
          : meta.label,
        wfType: canvasType,
        status: (n.status === "failed"
          ? "failed_final"
          : n.status) as NodeStatus,
        locked: true,
        config: n.config ?? {},
        lane,
        ...branchMergeData,
      },
      draggable: false,
    }
  })

  const rfEdges: Edge[] = snapEdges.map((e) => ({
    id: `e-${e.from}-${e.to}-${e.sourceHandle ?? ""}-${e.targetHandle ?? ""}`,
    source: e.from,
    target: e.to,
    sourceHandle: e.sourceHandle,
    targetHandle: e.targetHandle,
    type: "plus_edge",
    animated: true,
    style: { stroke: "#00A589", strokeWidth: 2 },
  }))

  return { nodes: [...rfNodes, ...extraLayoutNodes], edges: rfEdges }
}

function normalizeLaneKey(lane: string | null | undefined): string {
  return (lane ?? "").trim().toLowerCase()
}

function laneKeyFromNode(node: WfRfNode): string | null {
  if (node.type === "plus_placeholder") return null
  const lane = node.data.lane?.trim()
  if (lane) return lane
  const laneId = (node.data.config as { laneId?: string } | undefined)?.laneId
  return typeof laneId === "string" && laneId.trim() ? laneId.trim() : null
}

/**
 * Template workflow editor → swimlane positions (trunk row + per-channel lanes).
 */
export function layoutTemplateGraphToRf(
  nodes: WfRfNode[],
  edges: Edge[],
  channelHandles: BranchChannelHandle[] = [],
): { nodes: WfRfNode[]; edges: Edge[] } {
  if (nodes.length === 0) return { nodes, edges }

  const branch = nodes.find((n) => n.type === "branchNode")
  const merge = nodes.find(
    (n) =>
      n.type === "mergeNode" ||
      (n.type === "wfNode" && n.data.wfType === "merge"),
  )

  const workflowEdges: WorkflowEdge[] = edges
    .filter((e) => !isPreviewEdgeId(e.id))
    .map((e) => ({
      from: e.source,
      to: e.target,
      sourceHandle: e.sourceHandle ?? undefined,
      targetHandle: e.targetHandle ?? undefined,
    }))

  if (!branch || !merge) {
    const ordered = topologicalOrder(
      nodes.map((n) => n.id),
      workflowEdges,
    )
    const positionById = new Map<string, { x: number; y: number }>()
    ordered.forEach((id, i) => {
      positionById.set(id, { x: 80 + i * (NODE_W + PIPE_GAP), y: CENTER_Y })
    })
    return {
      nodes: nodes.map((n) => ({
        ...n,
        position: positionById.get(n.id) ?? n.position,
      })),
      edges,
    }
  }

  const subgraphIds = collectReachable(workflowEdges, branch.id, merge.id)
  const trunkIds = new Set(
    nodes
      .filter(
        (n) =>
          n.id === branch.id ||
          n.id === merge.id ||
          !subgraphIds.has(n.id),
      )
      .map((n) => n.id),
  )

  const trunkEdges = workflowEdges.filter(
    (e) => trunkIds.has(e.from) && trunkIds.has(e.to),
  )
  const trunkOrdered = topologicalOrder([...trunkIds], trunkEdges)

  const positionById = new Map<string, { x: number; y: number }>()
  trunkOrdered.forEach((id, i) => {
    positionById.set(id, { x: 80 + i * (NODE_W + PIPE_GAP), y: CENTER_Y })
  })

  const branchPos = positionById.get(branch.id) ?? { x: 80, y: CENTER_Y }
  positionById.set(branch.id, branchPos)

  const laneKeysFromNodes = [
    ...new Set(
      nodes
        .filter((n) => subgraphIds.has(n.id))
        .map(laneKeyFromNode)
        .filter((lane): lane is string => Boolean(lane)),
    ),
  ]
  const laneOrder =
    channelHandles.length > 0
      ? channelHandles.map((ch) => ch.id)
      : laneKeysFromNodes

  laneOrder.forEach((laneKey, laneIndex) => {
    const laneNodes = nodes.filter(
      (n) =>
        subgraphIds.has(n.id) &&
        normalizeLaneKey(laneKeyFromNode(n)) === normalizeLaneKey(laneKey),
    )
    if (laneNodes.length === 0) return

    const laneNodeIds = laneNodes.map((n) => n.id)
    const laneEdges = workflowEdges.filter(
      (e) => laneNodeIds.includes(e.from) && laneNodeIds.includes(e.to),
    )
    const ordered = topologicalOrder(laneNodeIds, laneEdges)
    const y =
      branchPos.y + (laneIndex - (laneOrder.length - 1) / 2) * LANE_GAP
    const laneStartX = branchPos.x + NODE_W + PIPE_GAP

    ordered.forEach((id, i) => {
      positionById.set(id, {
        x: laneStartX + i * (NODE_W + PIPE_GAP * 0.85),
        y,
      })
    })
  })

  const mergePos = positionById.get(merge.id)
  if (mergePos) {
    const maxLaneX = Math.max(
      branchPos.x + (NODE_W + PIPE_GAP) * 2,
      ...[...positionById.entries()]
        .filter(([id]) => subgraphIds.has(id))
        .map(([, pos]) => pos.x + NODE_W),
    )
    positionById.set(merge.id, {
      x: maxLaneX + PIPE_GAP,
      y: branchPos.y,
    })
  }

  return {
    nodes: nodes.map((n) => ({
      ...n,
      position: positionById.get(n.id) ?? n.position,
    })),
    edges,
  }
}

export function persistedLayoutFromApiNodes(
  apiNodes: WorkflowNode[],
): Map<string, { x: number; y: number }> {
  const map = new Map<string, { x: number; y: number }>()
  for (const n of apiNodes) {
    if (
      typeof n.x === "number" &&
      Number.isFinite(n.x) &&
      typeof n.y === "number" &&
      Number.isFinite(n.y)
    ) {
      map.set(n.nodeId, { x: n.x, y: n.y })
    }
  }
  return map
}

/** Apply saved canvas positions or auto-layout with persisted overlay. */
export function resolveWorkflowLayout(
  nodes: WfRfNode[],
  edges: Edge[],
  channelHandles: BranchChannelHandle[],
  persistedByNodeId: Map<string, { x: number; y: number }>,
): { nodes: WfRfNode[]; edges: Edge[] } {
  const persistable = nodes.filter((n) => n.type !== "plus_placeholder")
  const allHavePersisted =
    persistable.length > 0 &&
    persistable.every((n) => persistedByNodeId.has(n.id))

  const applyPersisted = (list: WfRfNode[]) =>
    list.map((n) => {
      const pos = persistedByNodeId.get(n.id)
      return pos ? { ...n, position: pos } : n
    })

  if (allHavePersisted) {
    return { nodes: applyPersisted(nodes), edges }
  }

  const laidOut = layoutTemplateGraphToRf(nodes, edges, channelHandles)
  return { nodes: applyPersisted(laidOut.nodes), edges: laidOut.edges }
}
