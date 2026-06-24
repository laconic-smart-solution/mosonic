import type { Edge } from "@xyflow/react"

import type {
  WfNodeData,
  WfRfNode,
} from "@/features/workflow/data/workflow-model"
import type { BranchChannelHandle } from "@/features/workflow/lib/branch-channels"
import { normalizeLaneId } from "@/features/workflow/lib/branch-channels"
import { createRfNode } from "@/features/workflow/lib/workflow-canvas-mutations"
import {
  adaptNodesByLane,
  buildLaneEdge,
  findBranchNode,
  findMergeNode,
  laneAdaptPosition,
  laneKeyFromRfNode,
  mergeNodePosition,
} from "@/features/workflow/lib/workflow-lane-layout"

const LANE_WF_ORDER = [
  "summarization",
  "translation",
  "image",
  "video",
] as const

function workflowNodeData(node: WfRfNode): WfNodeData | null {
  if (node.type === "plus_placeholder") return null
  return node.data
}

function laneWfPriority(wfType: string): number {
  const idx = LANE_WF_ORDER.indexOf(wfType as (typeof LANE_WF_ORDER)[number])
  return idx === -1 ? 99 : idx
}

function collectSubgraphNodeIds(
  branchId: string,
  mergeId: string,
  edges: Edge[],
): Set<string> {
  const subgraph = new Set<string>()
  const queue = edges.filter((e) => e.source === branchId).map((e) => e.target)
  while (queue.length > 0) {
    const current = queue.shift()!
    if (current === mergeId || subgraph.has(current)) continue
    subgraph.add(current)
    for (const edge of edges) {
      if (edge.source === current && edge.target !== mergeId) {
        queue.push(edge.target)
      }
    }
  }
  return subgraph
}

function collectDownstreamChain(
  startId: string,
  mergeId: string,
  edges: Edge[],
  nodesById: Map<string, WfRfNode>,
): WfRfNode[] {
  const chain: WfRfNode[] = []
  let current = startId
  const visited = new Set<string>([startId])

  for (;;) {
    const outgoing = edges.filter((e) => e.source === current)
    const nextEdge = outgoing.find((e) => e.target !== mergeId) ?? null
    if (!nextEdge) break
    if (visited.has(nextEdge.target)) break
    visited.add(nextEdge.target)
    const node = nodesById.get(nextEdge.target)
    if (!node || node.type === "plus_placeholder") break
    chain.push(node)
    current = nextEdge.target
    if (nextEdge.target === mergeId) break
  }

  return chain.sort((a, b) => {
    const aType = workflowNodeData(a)?.wfType ?? ""
    const bType = workflowNodeData(b)?.wfType ?? ""
    return laneWfPriority(aType) - laneWfPriority(bType)
  })
}

function cloneLaneNode(
  source: WfRfNode,
  lane: BranchChannelHandle,
  position: { x: number; y: number },
  branchChannels: BranchChannelHandle[],
): WfRfNode {
  const sourceData = workflowNodeData(source)
  if (!sourceData) {
    throw new Error("cloneLaneNode requires a workflow node")
  }
  const cloned = createRfNode(sourceData.wfType, position, {
    branchChannels,
    lane,
  })
  const clonedData = workflowNodeData(cloned)
  if (!clonedData) {
    return cloned
  }
  return {
    ...cloned,
    data: {
      ...clonedData,
      config: {
        ...(sourceData.config ?? {}),
        ...(clonedData.config ?? {}),
        laneId: lane.id,
      },
    },
  } as WfRfNode
}

function findAdaptForChannel(
  byLane: Map<string, WfRfNode>,
  channelId: string,
): WfRfNode | undefined {
  const normalized = normalizeLaneId(channelId)
  return (
    byLane.get(normalized) ??
    byLane.get(channelId) ??
    [...byLane.entries()].find(
      ([lane]) => normalizeLaneId(lane) === normalized,
    )?.[1]
  )
}

function expandSharedChainPerLane(
  nodes: WfRfNode[],
  edges: Edge[],
  branch: WfRfNode,
  merge: WfRfNode,
  branchChannels: BranchChannelHandle[],
  byLane: Map<string, WfRfNode>,
  sharedChainTemplates: WfRfNode[],
): { nodes: WfRfNode[]; edges: Edge[] } {
  const sortedTemplates = [...sharedChainTemplates].sort((a, b) => {
    const aType = workflowNodeData(a)?.wfType ?? ""
    const bType = workflowNodeData(b)?.wfType ?? ""
    return laneWfPriority(aType) - laneWfPriority(bType)
  })
  const removeIds = new Set(sortedTemplates.map((n) => n.id))
  const created: WfRfNode[] = []
  const newEdges: Edge[] = []

  branchChannels.forEach((ch, channelIndex) => {
    const adapt = findAdaptForChannel(byLane, ch.id)
    if (!adapt) return

    let prevId = adapt.id
    let prevNode = adapt

    sortedTemplates.forEach((template, chainIndex) => {
      const laneNode = cloneLaneNode(
        template,
        ch,
        {
          x:
            adapt.position.x +
            (chainIndex + 1) * (240 + 48),
          y:
            laneAdaptPosition(
              branch.position,
              channelIndex,
              branchChannels.length,
            ).y,
        },
        branchChannels,
      )
      created.push(laneNode)
      newEdges.push(buildLaneEdge(prevId, laneNode.id))
      prevId = laneNode.id
      prevNode = laneNode
    })

    newEdges.push(
      buildLaneEdge(prevNode.id, merge.id, { targetHandle: ch.id }),
    )
  })

  return {
    nodes: [...nodes.filter((n) => !removeIds.has(n.id)), ...created],
    edges: [
      ...edges.filter(
        (e) => !removeIds.has(e.source) && !removeIds.has(e.target),
      ),
      ...newEdges,
    ],
  }
}

/**
 * Expands incomplete lane subgraphs: shared adapt and/or shared downstream nodes
 * (image, video, translation, etc.) into one node per channel for the editor.
 */
export function expandLegacySingleAdapt(
  nodes: WfRfNode[],
  edges: Edge[],
  branchChannels: BranchChannelHandle[],
): { nodes: WfRfNode[]; edges: Edge[] } {
  if (branchChannels.length < 2) return { nodes, edges }

  const branch = findBranchNode(nodes)
  if (!branch) return { nodes, edges }

  let merge = findMergeNode(nodes)
  const nodesById = new Map<string, WfRfNode>(
    nodes
      .filter((n) => n.type !== "plus_placeholder")
      .map((n) => [n.id, n]),
  )

  if (!merge) {
    merge = createRfNode("merge", mergeNodePosition(branch.position), {
      branchChannels,
    })
    nodes = [...nodes, merge]
    nodesById.set(merge.id, merge)
  }

  const mergeId = merge.id
  const subgraphIds = collectSubgraphNodeIds(branch.id, mergeId, edges)
  const subgraphNodes = nodes.filter((n) => subgraphIds.has(n.id))
  const sharedSubgraphNodes = subgraphNodes.filter((n) => !laneKeyFromRfNode(n))
  const byLane = adaptNodesByLane(nodes)

  const needsAdaptExpansion = byLane.size < branchChannels.length
  const needsSharedChainExpansion = sharedSubgraphNodes.some(
    (n) => workflowNodeData(n)?.wfType !== "adapt",
  )

  if (!needsAdaptExpansion && !needsSharedChainExpansion) {
    return { nodes, edges }
  }

  if (!needsAdaptExpansion && needsSharedChainExpansion) {
    const sharedChainTemplates = sharedSubgraphNodes.filter(
      (n) => workflowNodeData(n)?.wfType !== "adapt",
    )
    return expandSharedChainPerLane(
      nodes,
      edges,
      branch,
      merge,
      branchChannels,
      byLane,
      sharedChainTemplates,
    )
  }

  const legacyAdapts = nodes.filter((n) => {
    const d = workflowNodeData(n)
    return d?.wfType === "adapt" && !laneKeyFromRfNode(n)
  })

  const templateAdapt =
    legacyAdapts.length === 1
      ? legacyAdapts[0]!
      : byLane.size === 1
        ? [...byLane.values()][0]!
        : legacyAdapts[0] ?? null
  if (!templateAdapt) return { nodes, edges }

  const downstreamChain = collectDownstreamChain(
    templateAdapt.id,
    mergeId,
    edges,
    nodesById,
  )

  const created: WfRfNode[] = []
  const newEdges: Edge[] = []

  const adaptIdsToRemove = new Set([
    templateAdapt.id,
    ...[...byLane.values()].map((n) => n.id),
  ])
  const sharedChainIds = new Set(
    [
      ...sharedSubgraphNodes,
      ...downstreamChain.filter((n) => !laneKeyFromRfNode(n)),
    ].map((n) => n.id),
  )
  const removeIds = new Set([...adaptIdsToRemove, ...sharedChainIds])

  branchChannels.forEach((ch, channelIndex) => {
    const adapt = cloneLaneNode(
      templateAdapt,
      ch,
      laneAdaptPosition(branch.position, channelIndex, branchChannels.length),
      branchChannels,
    )
    created.push(adapt)
    newEdges.push(buildLaneEdge(branch.id, adapt.id, { sourceHandle: ch.id }))

    let prevId = adapt.id
    let prevNode = adapt

    const chainTemplates =
      downstreamChain.length > 0
        ? downstreamChain
        : sharedSubgraphNodes.filter(
            (n) => workflowNodeData(n)?.wfType !== "adapt",
          )

    chainTemplates.forEach((template, chainIndex) => {
      const laneNode = cloneLaneNode(
        template,
        ch,
        {
          x: adapt.position.x + (chainIndex + 1) * (240 + 48),
          y: adapt.position.y,
        },
        branchChannels,
      )
      created.push(laneNode)
      newEdges.push(buildLaneEdge(prevId, laneNode.id))
      prevId = laneNode.id
      prevNode = laneNode
    })

    newEdges.push(
      buildLaneEdge(prevNode.id, merge.id, { targetHandle: ch.id }),
    )
  })

  return {
    nodes: [...nodes.filter((n) => !removeIds.has(n.id)), ...created],
    edges: [
      ...edges.filter(
        (e) => !removeIds.has(e.source) && !removeIds.has(e.target),
      ),
      ...newEdges,
    ],
  }
}
