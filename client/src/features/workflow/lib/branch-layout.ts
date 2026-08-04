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

const LANE_GAP = 180
const CENTER_Y = 160
const PREVIEW_EDGE_PREFIX = "preview-"
const PREVIEW_BRANCH_ID = "preview-branch"

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

/**
 * Seed status for a freshly materialized node from its real pipeline status
 * (not a hardcoded "idle") so the canvas reflects the true state immediately,
 * rather than depending entirely on a runtime-map overlay landing before the
 * user looks at the node (e.g. right after a page reload mid-run, before any
 * new socket event has fired for an already-running node).
 */
function initialRfStatus(status: PipelineNodeSnapshot["status"]): NodeStatus {
  return status === "failed" ? "failed_final" : status
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
  channelHandles?: BranchChannelHandle[]
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

function buildPipelineAutoPositions(
  snapNodes: PipelineNodeSnapshot[],
  snapEdges: WorkflowEdge[],
  lanes: string[],
): Map<string, { x: number; y: number }> {
  const laneOrder =
    lanes.length > 0
      ? lanes
      : [...new Set(snapNodes.map(laneLabel).filter(Boolean) as string[])]

  const mergeNode = snapNodes.find((n) => n.type === "merge")
  const mergeId = mergeNode?.nodeId
  const laneNodeIds = new Set(
    snapNodes
      .filter((n) => Boolean(n.lane?.trim()) || laneLabel(n))
      .map((n) => n.nodeId),
  )
  const trunkNodes = snapNodes.filter(
    (n) =>
      !laneNodeIds.has(n.nodeId) && (mergeId ? n.nodeId !== mergeId : true),
  )

  const trunkIds = trunkNodes.map((n) => n.nodeId)
  const trunkEdges = snapEdges.filter(
    (e) => trunkIds.includes(e.from) && trunkIds.includes(e.to),
  )
  const trunkOrdered = topologicalOrder(trunkIds, trunkEdges)

  const fanOutId = trunkNodes
    .map((n) => ({
      id: n.nodeId,
      count: snapEdges.filter(
        (e) => e.from === n.nodeId && laneNodeIds.has(e.to),
      ).length,
    }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count)[0]?.id

  const positionById = new Map<string, { x: number; y: number }>()
  trunkOrdered.forEach((id, i) => {
    positionById.set(id, {
      x: 80 + i * (NODE_W + PIPE_GAP),
      y: CENTER_Y,
    })
  })

  const fanOutX = fanOutId
    ? (positionById.get(fanOutId)?.x ?? 80)
    : 80 + Math.max(trunkOrdered.length - 1, 0) * (NODE_W + PIPE_GAP)
  const branchColumnX = fanOutX + NODE_W + PIPE_GAP

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
    const y =
      CENTER_Y + (laneIndex - (laneOrder.length - 1) / 2) * LANE_GAP
    const laneStartX = branchColumnX + NODE_W + PIPE_GAP

    ordered.forEach((id, i) => {
      positionById.set(id, {
        x: laneStartX + i * (NODE_W + PIPE_GAP * 0.85),
        y,
      })
    })
  })

  if (mergeId) {
    const maxLaneX = Math.max(
      branchColumnX + NODE_W + PIPE_GAP,
      ...[...positionById.entries()]
        .filter(([id]) => laneNodeIds.has(id))
        .map(([, pos]) => pos.x + NODE_W),
      0,
    )
    positionById.set(mergeId, {
      x: maxLaneX + PIPE_GAP,
      y: CENTER_Y,
    })
  }

  return positionById
}

function laneHandleFromNodeId(nodeId: string): string | null {
  const sep = nodeId.lastIndexOf("__")
  if (sep >= 0) {
    const lane = nodeId.slice(sep + 2).trim()
    return lane || null
  }
  return null
}

function laneNodeIdsFromSnapshot(
  snapNodes: PipelineNodeSnapshot[],
): Set<string> {
  return new Set(
    snapNodes
      .filter((n) => Boolean(n.lane?.trim()) || laneLabel(n))
      .map((n) => n.nodeId),
  )
}

/** Infer merge node id from graph edges when it was omitted from stored pipeline nodes. */
export function inferPipelineMergeNodeId(
  snapNodes: PipelineNodeSnapshot[],
  snapEdges: WorkflowEdge[],
): string | undefined {
  const direct = snapNodes.find((n) => n.type === "merge")
  if (direct) return direct.nodeId

  const laneNodeIds = laneNodeIdsFromSnapshot(snapNodes)
  if (laneNodeIds.size === 0) return undefined

  const inboundCount = new Map<string, number>()
  for (const edge of snapEdges) {
    if (!laneNodeIds.has(edge.from)) continue
    inboundCount.set(edge.to, (inboundCount.get(edge.to) ?? 0) + 1)
  }

  let bestId: string | undefined
  let bestCount = 1
  for (const [targetId, count] of inboundCount) {
    if (laneNodeIds.has(targetId)) continue
    if (count > bestCount) {
      bestId = targetId
      bestCount = count
    }
  }
  return bestId
}

/** Backfill merge row for legacy pipelines that stored graph edges but dropped the merge node. */
export function ensurePipelineMergeNode(
  snapNodes: PipelineNodeSnapshot[],
  snapEdges: WorkflowEdge[],
): PipelineNodeSnapshot[] {
  if (snapNodes.some((n) => n.type === "merge")) return snapNodes
  const mergeId = inferPipelineMergeNodeId(snapNodes, snapEdges)
  if (!mergeId) return snapNodes

  const maxOrder = snapNodes.reduce((max, node) => Math.max(max, node.order), 0)
  return [
    ...snapNodes,
    {
      nodeId: mergeId,
      type: "merge",
      order: maxOrder + 1,
      isLocked: true,
      userPrompt: "",
      config: {},
      lane: null,
      status: "pending",
      output: null,
      retryCount: 0,
      executedAt: null,
    },
  ]
}

function rewritePipelinePreviewEdges(
  snapEdges: WorkflowEdge[],
  fanOutId: string | null,
  mergeId: string | undefined,
  laneNodeIds: Set<string>,
): WorkflowEdge[] {
  if (!fanOutId || laneNodeIds.size === 0) return snapEdges

  const rewritten: WorkflowEdge[] = []
  let fanOutToBranch = false

  for (const edge of snapEdges) {
    const isFanOut = edge.from === fanOutId && laneNodeIds.has(edge.to)
    if (isFanOut) {
      if (!fanOutToBranch) {
        rewritten.push({ from: fanOutId, to: PREVIEW_BRANCH_ID })
        fanOutToBranch = true
      }
      const handle =
        edge.sourceHandle?.trim() ||
        laneHandleFromNodeId(edge.to) ||
        undefined
      rewritten.push({
        from: PREVIEW_BRANCH_ID,
        to: edge.to,
        ...(handle ? { sourceHandle: handle } : {}),
      })
      continue
    }

    if (mergeId && edge.to === mergeId && laneNodeIds.has(edge.from)) {
      const handle =
        edge.targetHandle?.trim() ||
        laneHandleFromNodeId(edge.from) ||
        undefined
      rewritten.push({
        from: edge.from,
        to: mergeId,
        ...(handle ? { targetHandle: handle } : {}),
      })
      continue
    }

    rewritten.push(edge)
  }

  return rewritten
}

/**
 * Materialized pipeline → React Flow nodes/edges (fallback when template is unavailable).
 */
export function pipelineGraphToRf(input: PipelineGraphInput): {
  nodes: WfRfNode[]
  edges: Edge[]
} {
  const {
    nodes: rawSnapNodes,
    edges: snapEdges,
    lanes,
    layout = {},
    channelHandles = [],
  } = input
  const snapNodes = ensurePipelineMergeNode(rawSnapNodes, snapEdges)
  const autoPositions = buildPipelineAutoPositions(snapNodes, snapEdges, lanes)

  const mergeNode = snapNodes.find((n) => n.type === "merge")
  const laneNodeIds = laneNodeIdsFromSnapshot(snapNodes)
  const trunkNodes = snapNodes.filter(
    (n) =>
      !laneNodeIds.has(n.nodeId) &&
      (mergeNode ? n.nodeId !== mergeNode.nodeId : true),
  )
  const fanOutId = trunkNodes
    .map((n) => ({
      id: n.nodeId,
      count: snapEdges.filter(
        (e) => e.from === n.nodeId && laneNodeIds.has(e.to),
      ).length,
    }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count)[0]?.id
  const fanOutX = fanOutId
    ? (autoPositions.get(fanOutId)?.x ?? 80)
    : 80
  const branchColumnX = fanOutX + NODE_W + PIPE_GAP

  const mergeId = mergeNode?.nodeId
  const laneOrder =
    lanes.length > 0
      ? lanes
      : [...new Set(snapNodes.map(laneLabel).filter(Boolean) as string[])]
  const showBranch =
    Boolean(fanOutId) && laneNodeIds.size > 0 && laneOrder.length >= 2

  const extraLayoutNodes: WfRfNode[] = []
  if (showBranch) {
    extraLayoutNodes.push({
      id: PREVIEW_BRANCH_ID,
      type: "branchNode",
      position: { x: branchColumnX, y: CENTER_Y },
      data: {
        label: "Branch",
        wfType: "branch",
        status: "idle",
        locked: true,
        config: { mode: "rule_channels" },
        channelHandles,
      },
      draggable: false,
    })
  } else {
    for (const [nodeId] of Object.entries(layout)) {
      if (snapNodes.some((n) => n.nodeId === nodeId)) continue
      if (!readLayoutPosition(layout, nodeId)) continue
      extraLayoutNodes.push({
        id: nodeId,
        type: "branchNode",
        position: { x: branchColumnX, y: CENTER_Y },
        data: {
          label: "Branch",
          wfType: "branch",
          status: "idle",
          locked: true,
          config: { mode: "rule_channels" },
          channelHandles,
        },
        draggable: false,
      })
    }
  }

  const previewEdges = showBranch
    ? rewritePipelinePreviewEdges(
        snapEdges,
        fanOutId ?? null,
        mergeId,
        laneNodeIds,
      )
    : snapEdges

  const rfNodes: WfRfNode[] = snapNodes.map((n) => {
    const canvasType = backendTypeToCanvas(n.type)
    const meta = WF_NODE_TYPES.find((t) => t.type === canvasType) ?? WF_NODE_TYPES[0]
    const rfType = rfNodeTypeForCanvas(canvasType)
    const pos = autoPositions.get(n.nodeId) ?? { x: 80, y: CENTER_Y }
    const lane = laneLabel(n)
    const displayChannel = lane ? channelLabel(lane) : null
    const branchMergeData =
      rfType === "branchNode" || rfType === "mergeNode"
        ? { channelHandles }
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
        status: initialRfStatus(n.status),
        locked: true,
        config: n.config ?? {},
        lane,
        ...branchMergeData,
      },
      draggable: false,
    }
  })

  const rfEdges: Edge[] = previewEdges.map((e) => ({
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
