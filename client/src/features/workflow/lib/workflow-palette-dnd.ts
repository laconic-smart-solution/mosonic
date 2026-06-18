import type { Edge } from "@xyflow/react"

import { NODE_H, NODE_W, type WfRfNode } from "@/features/workflow/data/workflow-model"
import {
  getAllowedInitialTypes,
  getAllowedInsertTypes,
  getAllowedNextTypes,
  hasBlockingOutgoingEdge,
  PLUS_POPOVER_TYPES,
  toValidationEdges,
  toValidationNodes,
  type PlusPopoverType,
  type ValidationContext,
} from "@/features/workflow/lib/workflow-node-validation"

export const WORKFLOW_CANVAS_DROP_ID = "workflow-canvas-drop"

export const PALETTE_DRAG_ID_PREFIX = "palette-"

export type WorkflowPaletteDragPayload = {
  wfType: PlusPopoverType
}

export type PaletteDropTarget =
  | { mode: "initial" }
  | { mode: "after"; sourceId: string }
  | { mode: "between"; edgeId: string }
  | { mode: "append"; sourceId: string }

export type PaletteDropHint =
  | { mode: "initial" }
  | { mode: "after"; sourceId: string }
  | { mode: "between"; edgeId: string }

/** Max flow-space distance from pointer to an edge segment to count as "on edge". */
export const EDGE_HIT_THRESHOLD = 40

function nodeCenter(node: WfRfNode): { x: number; y: number } {
  return {
    x: node.position.x + NODE_W / 2,
    y: node.position.y + NODE_H / 2,
  }
}

function pointInNodeBBox(
  flowPosition: { x: number; y: number },
  node: WfRfNode,
): boolean {
  return (
    flowPosition.x >= node.position.x &&
    flowPosition.x <= node.position.x + NODE_W &&
    flowPosition.y >= node.position.y &&
    flowPosition.y <= node.position.y + NODE_H
  )
}

function distancePointToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) {
    return Math.hypot(px - x1, py - y1)
  }
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  const projX = x1 + t * dx
  const projY = y1 + t * dy
  return Math.hypot(px - projX, py - projY)
}

function validationContext(
  nodes: WfRfNode[],
  edges: Edge[],
  channelCount: number,
): ValidationContext {
  return {
    nodes: toValidationNodes(nodes),
    edges: toValidationEdges(edges),
    channelCount,
  }
}

function isEmptyGraph(nodes: WfRfNode[]): boolean {
  const persistable = nodes.filter((n) => n.type !== "plus_placeholder")
  return persistable.length === 0
}

function canPlaceInitial(ctx: ValidationContext, wfType: PlusPopoverType): boolean {
  return getAllowedInitialTypes(ctx).includes(wfType)
}

function findNodeUnderPointer(
  flowPosition: { x: number; y: number },
  nodes: WfRfNode[],
): WfRfNode | null {
  const persistable = nodes.filter((n) => n.type !== "plus_placeholder")
  for (let i = persistable.length - 1; i >= 0; i--) {
    const node = persistable[i]
    if (node && pointInNodeBBox(flowPosition, node)) return node
  }
  return null
}

function findEdgeNearPointer(
  flowPosition: { x: number; y: number },
  nodes: WfRfNode[],
  edges: Edge[],
  ctx: ValidationContext,
  wfType: PlusPopoverType,
): { edgeId: string } | null {
  const nodesById = new Map(nodes.map((n) => [n.id, n]))
  let best: { edgeId: string; dist: number } | null = null

  for (const edge of edges) {
    if (!edge.source || !edge.target) continue
    const source = nodesById.get(edge.source)
    const target = nodesById.get(edge.target)
    if (!source || !target) continue
    if (source.type === "plus_placeholder" || target.type === "plus_placeholder") {
      continue
    }

    const allowed = getAllowedInsertTypes(ctx, edge.source, edge.target)
    if (!allowed.includes(wfType)) continue

    const s = nodeCenter(source)
    const t = nodeCenter(target)
    const dist = distancePointToSegment(
      flowPosition.x,
      flowPosition.y,
      s.x,
      s.y,
      t.x,
      t.y,
    )
    if (dist > EDGE_HIT_THRESHOLD) continue
    if (!best || dist < best.dist) {
      best = { edgeId: edge.id, dist }
    }
  }

  return best ? { edgeId: best.edgeId } : null
}

function findAppendTarget(
  flowPosition: { x: number; y: number },
  nodes: WfRfNode[],
  edges: Edge[],
  ctx: ValidationContext,
  wfType: PlusPopoverType,
): { sourceId: string } | null {
  const validationNodes = ctx.nodes
  let best: { sourceId: string; dist: number } | null = null

  for (const vnode of validationNodes) {
    if (hasBlockingOutgoingEdge(vnode.id, edges, validationNodes)) continue
    const allowed = getAllowedNextTypes(ctx, vnode.id)
    if (!allowed.includes(wfType)) continue

    const rf = nodes.find((n) => n.id === vnode.id)
    if (!rf || rf.type === "plus_placeholder") continue
    const c = nodeCenter(rf)
    const dist = Math.hypot(flowPosition.x - c.x, flowPosition.y - c.y)
    if (!best || dist < best.dist) {
      best = { sourceId: vnode.id, dist }
    }
  }

  return best ? { sourceId: best.sourceId } : null
}

/**
 * Resolves where a palette drop should connect, or null if the node type cannot be placed.
 */
export function resolvePaletteDropTarget(
  flowPosition: { x: number; y: number },
  wfType: PlusPopoverType,
  nodes: WfRfNode[],
  edges: Edge[],
  channelCount: number,
): PaletteDropTarget | null {
  const ctx = validationContext(nodes, edges, channelCount)

  if (isEmptyGraph(nodes)) {
    return canPlaceInitial(ctx, wfType) ? { mode: "initial" } : null
  }

  const underNode = findNodeUnderPointer(flowPosition, nodes)
  if (underNode) {
    const allowed = getAllowedNextTypes(ctx, underNode.id)
    if (allowed.includes(wfType)) {
      return { mode: "after", sourceId: underNode.id }
    }
  }

  const onEdge = findEdgeNearPointer(flowPosition, nodes, edges, ctx, wfType)
  if (onEdge) {
    return { mode: "between", edgeId: onEdge.edgeId }
  }

  const append = findAppendTarget(flowPosition, nodes, edges, ctx, wfType)
  if (append) {
    return { mode: "append", sourceId: append.sourceId }
  }

  return null
}

function isAfterEligibleNode(node: WfRfNode): boolean {
  if (node.type === "plus_placeholder" || node.type === "branchNode") {
    return false
  }
  if (node.type === "mergeNode") return false
  const wfType = node.data?.wfType
  return wfType !== "merge"
}

/**
 * Lists every valid palette placement for a dragged type (not pointer-based).
 */
export function listPaletteDropHints(
  wfType: PlusPopoverType,
  nodes: WfRfNode[],
  edges: Edge[],
  channelCount: number,
): PaletteDropHint[] {
  const ctx = validationContext(nodes, edges, channelCount)
  const hints: PaletteDropHint[] = []

  if (isEmptyGraph(nodes)) {
    if (canPlaceInitial(ctx, wfType)) {
      hints.push({ mode: "initial" })
    }
    return hints
  }

  const nodesById = new Map(nodes.map((n) => [n.id, n]))

  for (const vnode of ctx.nodes) {
    if (hasBlockingOutgoingEdge(vnode.id, edges, ctx.nodes)) continue
    const allowed = getAllowedNextTypes(ctx, vnode.id)
    if (!allowed.includes(wfType)) continue

    const rf = nodesById.get(vnode.id)
    if (!rf || !isAfterEligibleNode(rf)) continue
    hints.push({ mode: "after", sourceId: vnode.id })
  }

  for (const edge of edges) {
    if (!edge.source || !edge.target) continue
    const source = nodesById.get(edge.source)
    const target = nodesById.get(edge.target)
    if (!source || !target) continue
    if (source.type === "plus_placeholder" || target.type === "plus_placeholder") {
      continue
    }

    const allowed = getAllowedInsertTypes(ctx, edge.source, edge.target)
    if (!allowed.includes(wfType)) continue
    hints.push({ mode: "between", edgeId: edge.id })
  }

  return hints
}

/** Source node id when target is after or append placement. */
export function afterSourceIdFromTarget(
  target: PaletteDropTarget | null,
): string | null {
  if (!target) return null
  if (target.mode === "after" || target.mode === "append") {
    return target.sourceId
  }
  return null
}

/** Whether an active drop target matches a static hint for highlighting. */
export function paletteDropHintsMatch(
  hint: PaletteDropHint,
  target: PaletteDropTarget | null,
): boolean {
  if (!target) return false
  if (hint.mode === "initial" && target.mode === "initial") return true
  if (hint.mode === "between" && target.mode === "between") {
    return hint.edgeId === target.edgeId
  }
  if (hint.mode === "after") {
    const sourceId = afterSourceIdFromTarget(target)
    return sourceId === hint.sourceId
  }
  return false
}

export function paletteDragIdForType(wfType: PlusPopoverType): string {
  return `${PALETTE_DRAG_ID_PREFIX}${wfType}`
}

export function parsePaletteDragId(id: string | number): PlusPopoverType | null {
  const s = String(id)
  if (!s.startsWith(PALETTE_DRAG_ID_PREFIX)) return null
  const wfType = s.slice(PALETTE_DRAG_ID_PREFIX.length)
  if ((PLUS_POPOVER_TYPES as readonly string[]).includes(wfType)) {
    return wfType as PlusPopoverType
  }
  return null
}
