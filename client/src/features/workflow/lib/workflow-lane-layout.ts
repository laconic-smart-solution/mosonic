import type { Edge } from "@xyflow/react"

import { NODE_W, PIPE_GAP, type WfRfNode } from "@/features/workflow/data/workflow-model"
import type { BranchChannelHandle } from "@/features/workflow/lib/branch-channels"

export const LANE_GAP = 140

const LANE_EDGE_STYLE = { stroke: "#00A589", strokeWidth: 2 }

export function laneEdgeId(
  source: string,
  target: string,
  handles?: { sourceHandle?: string; targetHandle?: string },
): string {
  const sh = handles?.sourceHandle ?? ""
  const th = handles?.targetHandle ?? ""
  return `e-${source}-${sh}-${target}-${th}`
}

export function buildLaneEdge(
  source: string,
  target: string,
  handles?: { sourceHandle?: string; targetHandle?: string },
): Edge {
  return {
    id: laneEdgeId(source, target, handles),
    source,
    target,
    sourceHandle: handles?.sourceHandle,
    targetHandle: handles?.targetHandle,
    type: "plus_edge",
    animated: true,
    style: LANE_EDGE_STYLE,
  }
}

export function laneAdaptPosition(
  branchPosition: { x: number; y: number },
  channelIndex: number,
  channelCount: number,
): { x: number; y: number } {
  const x = branchPosition.x + NODE_W + PIPE_GAP
  const y =
    branchPosition.y + (channelIndex - (channelCount - 1) / 2) * LANE_GAP
  return { x, y }
}

export function findMergeNode(nodes: WfRfNode[]): WfRfNode | undefined {
  return nodes.find(
    (n) =>
      n.type === "mergeNode" ||
      (n.type === "wfNode" && n.data.wfType === "merge"),
  )
}

export function findBranchNode(nodes: WfRfNode[]): WfRfNode | undefined {
  return nodes.find((n) => n.type === "branchNode")
}

export function adaptNodesByLane(nodes: WfRfNode[]): Map<string, WfRfNode> {
  const map = new Map<string, WfRfNode>()
  for (const node of nodes) {
    if (node.type === "plus_placeholder") continue
    if (node.data.wfType !== "adapt") continue
    const lane = node.data.lane?.trim()
    if (lane) map.set(lane, node)
  }
  return map
}

export function channelsMissingAdapt(
  channels: BranchChannelHandle[],
  byLane: Map<string, WfRfNode>,
): BranchChannelHandle[] {
  return channels.filter((ch) => !byLane.has(ch.id))
}

export function mergeNodePosition(branchPosition: {
  x: number
  y: number
}): { x: number; y: number } {
  return {
    x: branchPosition.x + (NODE_W + PIPE_GAP) * 2,
    y: branchPosition.y,
  }
}

/** Node ids removed when a branch node is deleted (merge + all lane subgraph nodes). */
export function collectBranchCascadeDeleteIds(
  branchId: string,
  nodes: WfRfNode[],
  edges: Edge[],
): Set<string> {
  const remove = new Set<string>([branchId])
  const merge = findMergeNode(nodes)
  if (merge) remove.add(merge.id)

  for (const node of nodes) {
    if (node.type === "plus_placeholder") continue
    if (node.data.lane?.trim()) remove.add(node.id)
  }

  const outgoing = new Map<string, string[]>()
  for (const edge of edges) {
    if (!edge.source || !edge.target) continue
    const list = outgoing.get(edge.source) ?? []
    list.push(edge.target)
    outgoing.set(edge.source, list)
  }

  const queue = [...(outgoing.get(branchId) ?? [])]
  const visited = new Set<string>()
  while (queue.length > 0) {
    const current = queue.shift()!
    if (visited.has(current)) continue
    visited.add(current)
    remove.add(current)
    for (const next of outgoing.get(current) ?? []) {
      if (merge && next === merge.id) {
        remove.add(next)
        continue
      }
      queue.push(next)
    }
  }

  return remove
}
