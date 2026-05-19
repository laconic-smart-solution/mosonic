import type { Edge } from "@xyflow/react"

import type {
  WfNodeData,
  WfRfNode,
} from "@/features/workflow/data/workflow-model"
import type { BranchChannelHandle } from "@/features/workflow/lib/branch-channels"
import { createRfNode } from "@/features/workflow/lib/workflow-canvas-mutations"
import {
  adaptNodesByLane,
  buildLaneEdge,
  findBranchNode,
  findMergeNode,
  laneAdaptPosition,
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

/**
 * Expands a legacy single shared adapt (no lane) into one adapt per channel for the editor.
 * Reconnects downstream lane nodes (image, video, etc.) per channel.
 */
export function expandLegacySingleAdapt(
  nodes: WfRfNode[],
  edges: Edge[],
  branchChannels: BranchChannelHandle[],
): { nodes: WfRfNode[]; edges: Edge[] } {
  if (branchChannels.length < 2) return { nodes, edges }

  const branch = findBranchNode(nodes)
  if (!branch) return { nodes, edges }

  const legacyAdapts = nodes.filter((n) => {
    const d = workflowNodeData(n)
    return d?.wfType === "adapt" && !d.lane?.trim()
  })
  if (legacyAdapts.length !== 1) return { nodes, edges }

  const byLane = adaptNodesByLane(nodes)
  if (byLane.size > 0) return { nodes, edges }

  const legacy = legacyAdapts[0]!
  let merge = findMergeNode(nodes)
  const nodesById = new Map(
    nodes
      .filter((n) => n.type !== "plus_placeholder")
      .map((n) => [n.id, n]),
  )
  const mergeId = merge?.id ?? ""
  const downstreamChain = mergeId
    ? collectDownstreamChain(legacy.id, mergeId, edges, nodesById)
    : []

  const created: WfRfNode[] = []
  const newEdges: Edge[] = []

  if (!merge) {
    merge = createRfNode("merge", mergeNodePosition(branch.position), {
      branchChannels,
    })
    created.push(merge)
  }

  const sharedChainIds = new Set(
    downstreamChain
      .filter((n) => !workflowNodeData(n)?.lane?.trim())
      .map((n) => n.id),
  )
  const removeIds = new Set([legacy.id, ...sharedChainIds])

  branchChannels.forEach((ch, channelIndex) => {
    const adapt = createRfNode(
      "adapt",
      laneAdaptPosition(branch.position, channelIndex, branchChannels.length),
      { branchChannels, lane: ch },
    )
    created.push(adapt)
    newEdges.push(buildLaneEdge(branch.id, adapt.id, { sourceHandle: ch.id }))

    let prevId = adapt.id
    let prevNode = adapt

    downstreamChain.forEach((template, chainIndex) => {
      const laneNode = cloneLaneNode(
        template,
        ch,
        {
          x:
            adapt.position.x +
            (chainIndex + 1) * (240 + 48),
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
