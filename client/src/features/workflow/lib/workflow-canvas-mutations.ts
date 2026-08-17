import type { Edge } from "@xyflow/react"
import type { Dispatch, SetStateAction } from "react"

import {
  NODE_H,
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
import { formatLaneNodeLabel } from "@/features/workflow/lib/lane-node-label"
import {
  adaptNodesByLane,
  buildLaneEdge,
  channelsMissingAdapt,
  collectBranchCascadeDeleteIds,
  findBranchNode,
  findMergeNode,
  laneAdaptPosition,
  laneKeyFromRfNode,
  mergeNodePosition,
} from "@/features/workflow/lib/workflow-lane-layout"
import { randomUuid } from "@/lib/random-uuid"

import type { PaletteDropTarget } from "@/features/workflow/lib/workflow-palette-dnd"
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
  const displayLabel = lane
    ? formatLaneNodeLabel(wfType, lane.label)
    : meta.label
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
      label: displayLabel,
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

/** Top-left node position when drop point is the cursor center in flow coords. */
export function nodePositionFromDropCenter(flowPosition: {
  x: number
  y: number
}): { x: number; y: number } {
  return {
    x: flowPosition.x - NODE_W / 2,
    y: flowPosition.y - NODE_H / 2,
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

export function materializeBranchSubgraph(
  nodes: WfRfNode[],
  edges: Edge[],
  branchId: string,
  branchChannels: BranchChannelHandle[],
): { nodes: WfRfNode[]; edges: Edge[] } {
  if (branchChannels.length === 0) {
    return { nodes, edges }
  }
  const { nodes: nextNodes, edges: nextEdges } = applySpawnLaneAdapts(
    nodes,
    edges,
    branchId,
    branchChannels,
  )
  return { nodes: nextNodes, edges: nextEdges }
}

export function replaceInitialPlaceholder({
  wfType,
  setNodes,
  branchChannels = [],
}: ReplaceInitialPlaceholderArgs): WfRfNode {
  const newNode = createRfNode(wfType, { x: 0, y: 0 }, { branchChannels })
  if (wfType === "branch") {
    const { nodes } = materializeBranchSubgraph([newNode], [], newNode.id, branchChannels)
    setNodes(nodes)
    return newNode
  }
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

/**
 * Drops a node's edges and bridges its predecessor(s) directly to its
 * successor(s) so deleting a node mid-chain doesn't leave the graph split.
 * A node with no incoming or no outgoing edge (a chain end) has nothing to
 * bridge — it's simply removed, same as before.
 */
export function bridgeEdgesAcrossRemovedNode(
  nodeId: string,
  edges: Edge[],
): Edge[] {
  const incoming = edges.filter((e) => e.target === nodeId)
  const outgoing = edges.filter((e) => e.source === nodeId)
  const remaining = edges.filter(
    (e) => e.source !== nodeId && e.target !== nodeId,
  )
  if (incoming.length === 0 || outgoing.length === 0) {
    return remaining
  }

  const seen = new Set(remaining.map((e) => `${e.source}->${e.target}`))
  const bridges: Edge[] = []
  for (const inc of incoming) {
    for (const out of outgoing) {
      if (inc.source === out.target) continue
      const key = `${inc.source}->${out.target}`
      if (seen.has(key)) continue
      seen.add(key)
      bridges.push(
        buildLaneEdge(inc.source, out.target, {
          sourceHandle: inc.sourceHandle ?? undefined,
          targetHandle: out.targetHandle ?? undefined,
        }),
      )
    }
  }
  return [...remaining, ...bridges]
}

function adaptHasLane(node: WfRfNode): boolean {
  return laneKeyFromRfNode(node).length > 0
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
    if (!validationNodes.some((n) => n.id === edge.target)) {
      const targetNode =
        workingNodes.find((n) => n.id === edge.target) ??
        created.find((n) => n.id === edge.target)
      const targetData = targetNode ? workflowNodeData(targetNode) : null
      validationNodes.push({
        id: edge.target,
        data: {
          wfType: targetData?.wfType ?? "",
          lane: targetData?.lane ?? edge.targetHandle ?? null,
        },
      })
    }
  }

  return {
    nodes: workingNodes,
    edges: [...workingEdges, ...newEdges],
    created,
  }
}

/**
 * A lane must always route through at least one node (normally Adapt) — a
 * direct Branch→Merge edge is never a valid state, since nothing downstream
 * (insert-between, the palette matrix, server-side materialization) expects
 * it. Deleting the last remaining node in a lane produces exactly that via
 * bridgeEdgesAcrossRemovedNode's generic predecessor→successor bridge.
 *
 * Branching is optional, so this is treated as the user deliberately
 * dropping that channel from the workflow, not damage to repair: the direct
 * edge is stripped and the channel is removed from the Branch node's active
 * selection (switching to an explicit "wizard_channels" config). If that was
 * the last active channel, Branch/Merge no longer mean anything and are
 * cascade-removed too, same as deleting the Branch node directly.
 */
export function repairDirectBranchMergeEdges(
  nodes: WfRfNode[],
  edges: Edge[],
  branchChannels: BranchChannelHandle[],
): { nodes: WfRfNode[]; edges: Edge[] } {
  const branch = findBranchNode(nodes)
  const merge = findMergeNode(nodes)
  if (!branch || !merge) return { nodes, edges }

  const directLaneIds = new Set(
    edges
      .filter((e) => e.source === branch.id && e.target === merge.id)
      .map((e) => e.sourceHandle ?? e.targetHandle ?? "")
      .filter((id): id is string => Boolean(id)),
  )
  if (directLaneIds.size === 0) return { nodes, edges }

  const remainingChannels = branchChannels.filter((c) => !directLaneIds.has(c.id))

  if (remainingChannels.length === 0) {
    const removeIds = collectBranchCascadeDeleteIds(branch.id, nodes, edges)
    return {
      nodes: nodes.filter((n) => !removeIds.has(n.id)),
      edges: edges.filter(
        (e) => !removeIds.has(e.source) && !removeIds.has(e.target),
      ),
    }
  }

  const strippedEdges = edges.filter(
    (e) => !(e.source === branch.id && e.target === merge.id),
  )
  const remainingIds = remainingChannels.map((c) => c.id)
  const nextNodes = nodes.map((n) => {
    if (n.id !== branch.id && n.id !== merge.id) return n
    const data = workflowNodeData(n)
    if (!data) return n
    return {
      ...n,
      data: {
        ...data,
        channelHandles: remainingChannels,
        ...(n.id === branch.id
          ? { config: { mode: "wizard_channels", channels: remainingIds } }
          : {}),
      },
    } as WfRfNode
  })

  return { nodes: nextNodes, edges: strippedEdges }
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

function relabelLaneNode(
  node: WfRfNode,
  branchChannels: BranchChannelHandle[],
): WfRfNode {
  const data = workflowNodeData(node)
  if (!data) return node
  const laneKey = laneKeyFromRfNode(node)
  const handle = branchChannels.find((ch) => ch.id === laneKey)
  if (!handle) return node
  const label = formatLaneNodeLabel(data.wfType, handle.label)
  const config =
    data.wfType === "adapt"
      ? { ...(data.config ?? {}), laneId: handle.id, channel: handle.label }
      : { ...(data.config ?? {}), laneId: handle.id }
  return {
    ...node,
    data: {
      ...data,
      label,
      lane: handle.id,
      config,
    },
  } as WfRfNode
}

export type SyncBranchLanesResult = {
  nodes: WfRfNode[]
  edges: Edge[]
  removedLaneLabels: string[]
}

/**
 * Align branch subgraph with selected channels: drop deselected lanes, spawn missing adapts, relabel.
 */
export function syncBranchLanesToChannels(
  nodes: WfRfNode[],
  edges: Edge[],
  branchChannels: BranchChannelHandle[],
): SyncBranchLanesResult {
  const branch = findBranchNode(nodes)
  if (!branch) {
    return { nodes, edges, removedLaneLabels: [] }
  }

  const selected = new Set(branchChannels.map((ch) => ch.id))
  const channelLabelById = new Map(
    branchChannels.map((ch) => [ch.id, ch.label] as const),
  )

  const removedLaneLabels: string[] = []
  const removeIds = new Set<string>()

  for (const node of nodes) {
    if (node.type === "plus_placeholder") continue
    if (node.id === branch.id) continue
    if (node.type === "mergeNode" || workflowNodeData(node)?.wfType === "merge") {
      continue
    }
    const laneKey = laneKeyFromRfNode(node)
    if (!laneKey) continue
    if (!selected.has(laneKey)) {
      removeIds.add(node.id)
      const prev =
        channelLabelById.get(laneKey) ??
        laneKey.charAt(0).toUpperCase() + laneKey.slice(1)
      if (!removedLaneLabels.includes(prev)) {
        removedLaneLabels.push(prev)
      }
    }
  }

  let workingNodes = nodes.filter(
    (n) => n.type === "plus_placeholder" || !removeIds.has(n.id),
  )
  let workingEdges = edges.filter(
    (e) => !removeIds.has(e.source) && !removeIds.has(e.target),
  )

  if (branchChannels.length >= 1) {
    const spawned = applySpawnLaneAdapts(
      workingNodes,
      workingEdges,
      branch.id,
      branchChannels,
    )
    workingNodes = spawned.nodes
    workingEdges = spawned.edges
  }

  const relabeled = workingNodes.map((n) => {
    if (n.type === "plus_placeholder") return n
    if (n.id === branch.id) {
      const data = workflowNodeData(n)
      if (!data) return n
      // Don't force `mode` here: `branchChannels` already carries whatever
      // selection produced it (Rule channels or an explicit wizard_channels
      // pick), and this runs on every passive apiNodes reconciliation, not
      // just user-driven rule-channel changes. Forcing rule_channels here
      // silently discarded a saved wizard_channels selection on next load,
      // so the *next* save would drop the user's explicitly picked channels.
      return {
        ...n,
        data: {
          ...data,
          channelHandles: branchChannels,
          config: data.config ?? {},
        },
      } as WfRfNode
    }
    if (n.type === "mergeNode" || workflowNodeData(n)?.wfType === "merge") {
      const data = workflowNodeData(n)
      if (!data) return n
      return {
        ...n,
        data: { ...data, channelHandles: branchChannels },
      } as WfRfNode
    }
    const laneKey = laneKeyFromRfNode(n)
    if (!laneKey || !selected.has(laneKey)) return n
    return relabelLaneNode(n, branchChannels)
  })

  return { nodes: relabeled, edges: workingEdges, removedLaneLabels }
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
  /** When set (e.g. palette drop), place the new node here instead of after source. */
  position?: { x: number; y: number }
}

export function addNodeAfter({
  sourceId,
  wfType,
  nodes,
  edges,
  setNodes,
  setEdges,
  branchChannels = [],
  position: positionOverride,
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

  if (wfType === "branch") {
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

    const placeAt = positionOverride ?? positionAfterSource(source)
    const newNode = createRfNode("branch", placeAt, { branchChannels })

    if (
      wouldCreateCycle(validationNodes, validationEdges, sourceId, newNode.id)
    ) {
      return null
    }

    let workingNodes = [
      ...nodes.filter((n) => n.type !== "plus_placeholder"),
      newNode,
    ]
    let workingEdges = [...edges, buildPlusEdge(sourceId, newNode.id)]
    const materialized = materializeBranchSubgraph(
      workingNodes,
      workingEdges,
      newNode.id,
      branchChannels,
    )
    setNodes(materialized.nodes)
    setEdges(materialized.edges)
    return newNode
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

  const placeAt = positionOverride ?? positionAfterSource(source)
  const newNode = createRfNode(wfType, placeAt, {
    branchChannels,
    lane: laneHandle,
  })

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
  position?: { x: number; y: number }
}

export function insertNodeBetween({
  edgeId,
  wfType,
  nodes,
  edges,
  setNodes,
  setEdges,
  branchChannels,
  position: positionOverride,
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

  const insertPos = positionOverride ?? {
    x: (source.position.x + target.position.x) / 2,
    y: (source.position.y + target.position.y) / 2,
  }

  const laneId = sourceData.lane?.trim() || targetData?.lane?.trim()
  const laneHandle = laneId
    ? branchChannels?.find((ch) => ch.id === laneId)
    : undefined

  const newNode = createRfNode(wfType, insertPos, {
    branchChannels,
    lane: laneHandle,
  })

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

  const filtered = nodes.filter((n) => n.type !== "plus_placeholder")
  const shifted = filtered.map((n) =>
    toShift.has(n.id)
      ? { ...n, position: { ...n.position, x: n.position.x + shiftX } }
      : n,
  )
  let workingNodes = [...shifted, newNode]
  let workingEdges = [
    ...edges.filter((e) => e.id !== edgeId),
    buildPlusEdge(edge.source, newNode.id),
    buildPlusEdge(newNode.id, edge.target),
  ]

  if (wfType === "branch") {
    const materialized = materializeBranchSubgraph(
      workingNodes,
      workingEdges,
      newNode.id,
      branchChannels ?? [],
    )
    setNodes(materialized.nodes)
    setEdges(materialized.edges)
    return newNode
  }

  setNodes(workingNodes)
  setEdges(workingEdges)

  return newNode
}

export type AddNodeFromPaletteDropArgs = {
  wfType: string
  flowPosition: { x: number; y: number }
  target: PaletteDropTarget
  nodes: WfRfNode[]
  edges: Edge[]
  setNodes: Dispatch<SetStateAction<WfRfNode[]>>
  setEdges: Dispatch<SetStateAction<Edge[]>>
  branchChannels?: BranchChannelHandle[]
}

export function addNodeFromPaletteDrop({
  wfType,
  flowPosition,
  target,
  nodes,
  edges,
  setNodes,
  setEdges,
  branchChannels = [],
}: AddNodeFromPaletteDropArgs): WfRfNode | null {
  const nodePos = nodePositionFromDropCenter(flowPosition)

  if (target.mode === "initial") {
    const created = replaceInitialPlaceholder({
      wfType,
      setNodes,
      branchChannels,
    })
    setNodes((nds) =>
      nds.map((n) =>
        n.id === created.id ? { ...n, position: nodePos } : n,
      ),
    )
    return created
  }

  if (target.mode === "between") {
    return insertNodeBetween({
      edgeId: target.edgeId,
      wfType,
      nodes,
      edges,
      setNodes,
      setEdges,
      branchChannels,
      position: nodePos,
    })
  }

  const sourceId =
    target.mode === "after" ? target.sourceId : target.sourceId

  return addNodeAfter({
    sourceId,
    wfType,
    nodes,
    edges,
    setNodes,
    setEdges,
    branchChannels,
    position: nodePos,
  })
}
