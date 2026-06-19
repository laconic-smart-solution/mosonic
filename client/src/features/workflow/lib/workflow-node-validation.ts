import type { Edge } from "@xyflow/react"

import i18n from "@/i18n"
import type { WfNodeData, WfRfNode } from "@/features/workflow/data/workflow-model"
import { normalizeLaneId } from "@/features/workflow/lib/branch-channels"
import { laneKeyFromRfNode } from "@/features/workflow/lib/workflow-lane-layout"
import { VIDEO_CINEMATIC_UI_ENABLED } from "@/features/workflow/lib/video-generation-ui"

import { canvasNextMatrix, type PlusPopoverKey } from "@workflow-next-matrix"

/** Canvas wfType values allowed in the plus-insert popover. */
export const PLUS_POPOVER_TYPES = [
  "keywords",
  "intelligence",
  "text",
  "branch",
  "image",
  "video",
  "summarization",
  "translation",
] as const

export type PlusPopoverType = (typeof PLUS_POPOVER_TYPES)[number]

export type GraphContext = "trunk" | "lane"

export type ValidationGraphNode = {
  id: string
  data: { wfType: string; lane?: string | null }
}

export type ValidationGraphEdge = {
  source: string
  target: string
}

export type ValidationContext = {
  nodes: ValidationGraphNode[]
  edges: ValidationGraphEdge[]
  channelCount: number
}

const STARTER_NODES: readonly PlusPopoverType[] = [
  "keywords",
  "intelligence",
  "text",
]

const TRUNK_ONLY = new Set<PlusPopoverType>([
  "keywords",
  "intelligence",
  "branch",
])

const ENRICHMENT_BEFORE_TEXT: readonly PlusPopoverType[] = [
  "keywords",
  "intelligence",
]

const NEXT_MATRIX: Record<string, readonly PlusPopoverKey[]> =
  canvasNextMatrix()

function buildCanPrecede(
  matrix: Record<string, readonly PlusPopoverKey[]>,
): Record<string, PlusPopoverType[]> {
  const result: Record<string, PlusPopoverType[]> = {}
  for (const [from, targets] of Object.entries(matrix)) {
    if (!isPlusType(from)) continue
    for (const to of targets) {
      if (!isPlusType(to)) continue
      if (!result[to]) result[to] = []
      if (!result[to].includes(from)) {
        result[to].push(from)
      }
    }
  }
  return result
}

/** Types that may have an edge into `targetType` per the connection matrix. */
const CAN_PRECEDE = buildCanPrecede(NEXT_MATRIX)

export function getNodePopoverDescription(type: PlusPopoverType): string {
  return i18n.t(`workflow:popoverDescriptions.${type}`)
}

/** @deprecated Use getNodePopoverDescription for locale-aware labels. */
export const NODE_POPOVER_DESCRIPTIONS: Record<PlusPopoverType, string> =
  new Proxy({} as Record<PlusPopoverType, string>, {
    get(_target, prop: string) {
      if (isPlusType(prop)) return getNodePopoverDescription(prop)
      return undefined
    },
  })

function isPlusType(t: string): t is PlusPopoverType {
  return (PLUS_POPOVER_TYPES as readonly string[]).includes(t)
}

function filterPlusTypes(types: readonly string[]): PlusPopoverType[] {
  return types.filter(isPlusType)
}

export function hasWorkflowBranch(nodes: ValidationGraphNode[]): boolean {
  return nodes.some((n) => n.data.wfType === "branch")
}

export function hasWorkflowMerge(nodes: ValidationGraphNode[]): boolean {
  return nodes.some((n) => n.data.wfType === "merge")
}

function getBranchAndMerge(nodes: ValidationGraphNode[]): {
  branchId: string | null
  mergeId: string | null
} {
  const branch = nodes.find((n) => n.data.wfType === "branch")
  const merge = nodes.find((n) => n.data.wfType === "merge")
  return { branchId: branch?.id ?? null, mergeId: merge?.id ?? null }
}

function collectReachable(
  edges: ValidationGraphEdge[],
  startId: string,
  stopId: string | null,
): Set<string> {
  const visited = new Set<string>()
  const queue = edges.filter((e) => e.source === startId).map((e) => e.target)
  while (queue.length > 0) {
    const current = queue.shift()!
    if (stopId && current === stopId) continue
    if (visited.has(current)) continue
    visited.add(current)
    for (const edge of edges) {
      if (edge.source === current) {
        queue.push(edge.target)
      }
    }
  }
  return visited
}

function isInBranchMergeSubgraph(
  ctx: ValidationContext,
  nodeId: string,
): boolean {
  const { branchId, mergeId } = getBranchAndMerge(ctx.nodes)
  if (!branchId) return false
  const subgraph = collectReachable(ctx.edges, branchId, mergeId)
  return subgraph.has(nodeId)
}

function adaptNodeByLane(ctx: ValidationContext): Map<string, string> {
  const map = new Map<string, string>()
  for (const node of ctx.nodes) {
    if (node.data.wfType !== "adapt") continue
    const lane = node.data.lane?.trim()
    if (lane) map.set(normalizeLaneId(lane), node.id)
  }
  return map
}

function lanesMissingAdapt(ctx: ValidationContext): number {
  if (ctx.channelCount < 1) return 0
  return Math.max(0, ctx.channelCount - adaptNodeByLane(ctx).size)
}

export function branchNeedsLaneAdapts(ctx: ValidationContext): boolean {
  return lanesMissingAdapt(ctx) > 0
}

export function inferGraphContext(
  ctx: ValidationContext,
  nodeId: string,
): GraphContext {
  const node = ctx.nodes.find((n) => n.id === nodeId)
  if (!node) return "trunk"
  if (node.data.wfType === "adapt") return "lane"
  if (isInBranchMergeSubgraph(ctx, nodeId)) return "lane"
  return "trunk"
}

function applyExtraRules(
  types: PlusPopoverKey[],
  ctx: ValidationContext,
  opts: {
    sourceNodeId?: string
    sourceWfType?: string
    targetWfType?: string
    forInsert?: boolean
  },
): PlusPopoverType[] {
  const graphMode = hasWorkflowBranch(ctx.nodes)
  let result: PlusPopoverKey[] = [...types]

  if (ctx.nodes.some((n) => n.data.wfType === "branch")) {
    result = result.filter((t) => t !== "branch")
  }

  if (graphMode) {
    // Merge is auto-created with branch lanes; never pick manually in graph mode.
    result = result.filter((t) => t !== "merge")
  }

  const laneContext =
    opts.sourceNodeId != null
      ? inferGraphContext(ctx, opts.sourceNodeId) === "lane"
      : opts.sourceWfType != null &&
        opts.targetWfType != null &&
        (opts.sourceWfType === "branch" ||
          opts.targetWfType === "adapt" ||
          opts.targetWfType === "merge" ||
          isPlusType(opts.targetWfType))

  if (laneContext) {
    result = result.filter((t) => !(isPlusType(t) && TRUNK_ONLY.has(t)))
  }

  if (result.includes("adapt")) {
    const fromBranch = opts.sourceWfType === "branch"
    const adaptAllowed =
      graphMode &&
      (fromBranch ? branchNeedsLaneAdapts(ctx) : laneContext)
    if (!adaptAllowed) {
      result = result.filter((t) => t !== "adapt")
    }
  }

  const sourceLane = opts.sourceNodeId
    ? ctx.nodes.find((n) => n.id === opts.sourceNodeId)?.data.lane?.trim()
    : null
  if (sourceLane || laneContext) {
    result = result.filter((t) => t !== "merge")
  }

  if (opts.forInsert && opts.targetWfType === "text") {
    result = result.filter((t) => ENRICHMENT_BEFORE_TEXT.includes(t as PlusPopoverType))
  }

  return filterPlusTypes(result)
}

export function getMatrixNextTypes(sourceWfType: string): PlusPopoverType[] {
  return filterPlusTypes(NEXT_MATRIX[sourceWfType] ?? [])
}

export function getAllowedInitialTypes(ctx: ValidationContext): PlusPopoverType[] {
  void ctx
  return [...STARTER_NODES]
}

export function getAllowedNextTypes(
  ctx: ValidationContext,
  sourceNodeId: string,
): PlusPopoverType[] {
  const source = ctx.nodes.find((n) => n.id === sourceNodeId)
  if (!source) return []
  const base = getMatrixNextTypes(source.data.wfType)
  return applyExtraRules(base, ctx, {
    sourceNodeId,
    sourceWfType: source.data.wfType,
  })
}

export function getAllowedInsertTypes(
  ctx: ValidationContext,
  sourceNodeId: string,
  targetNodeId: string,
): PlusPopoverType[] {
  const source = ctx.nodes.find((n) => n.id === sourceNodeId)
  const target = ctx.nodes.find((n) => n.id === targetNodeId)
  if (!source || !target) return []

  const afterSource = getMatrixNextTypes(source.data.wfType)
  const beforeTarget = filterPlusTypes(CAN_PRECEDE[target.data.wfType] ?? [])
  const intersection = afterSource.filter((t) => beforeTarget.includes(t))

  return applyExtraRules(intersection, ctx, {
    sourceNodeId,
    sourceWfType: source.data.wfType,
    targetWfType: target.data.wfType,
    forInsert: true,
  })
}

export function wouldCreateCycle(
  nodes: ValidationGraphNode[],
  edges: ValidationGraphEdge[],
  from: string,
  to: string,
): boolean {
  if (from === to) return true
  const adj = new Map<string, string[]>()
  for (const n of nodes) {
    adj.set(n.id, [])
  }
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, [])
    adj.get(e.source)!.push(e.target)
  }
  if (!adj.has(from)) adj.set(from, [])
  adj.get(from)!.push(to)

  const visiting = new Set<string>()
  const visited = new Set<string>()

  function dfs(nodeId: string): boolean {
    if (visiting.has(nodeId)) return true
    if (visited.has(nodeId)) return false
    visiting.add(nodeId)
    for (const next of adj.get(nodeId) ?? []) {
      if (dfs(next)) return true
    }
    visiting.delete(nodeId)
    visited.add(nodeId)
    return false
  }

  for (const n of nodes) {
    if (dfs(n.id)) return true
  }
  return dfs(from)
}

export function toValidationNodes(rfNodes: WfRfNode[]): ValidationGraphNode[] {
  return rfNodes
    .filter((n) => n.type !== "plus_placeholder")
    .map((n) => ({
      id: n.id,
      data: {
        wfType: n.data.wfType,
        lane: laneKeyFromRfNode(n) || null,
      },
    }))
}

export function toValidationEdges(edges: Edge[]): ValidationGraphEdge[] {
  return edges
    .filter((e) => e.source && e.target)
    .map((e) => ({ source: e.source, target: e.target }))
}

/** True when an outgoing edge blocks the node-level plus (merge-only edges do not). */
export function hasBlockingOutgoingEdge(
  nodeId: string,
  edges: Edge[],
  nodes: ValidationGraphNode[],
): boolean {
  return edges.some((e) => {
    if (e.source !== nodeId) return false
    const target = nodes.find((n) => n.id === e.target)
    return target?.data.wfType !== "merge"
  })
}

export function branchHasAllLaneAdapts(
  channelCount: number,
  nodes: ValidationGraphNode[],
): boolean {
  if (channelCount === 0) return false
  return adaptNodeByLane({ nodes, edges: [], channelCount }).size >= channelCount
}

function wfTypeLabel(wfType: string): string {
  return i18n.t(`workflow:nodeTypesShort.${wfType}`, { defaultValue: wfType })
}

function laneIdFromRfNode(node: WfRfNode): string {
  return laneKeyFromRfNode(node)
}

/**
 * Branch graphs with 2+ channels require lane subgraph nodes to have a channel
 * (except a single shared adapt with no laneId, which materializes to all lanes).
 */
export function getBranchSubgraphLaneErrors(
  rfNodes: WfRfNode[],
  edges: Edge[],
  channelCount: number,
): string[] {
  if (channelCount < 2) return []

  const validationNodes = toValidationNodes(rfNodes)
  if (!hasWorkflowBranch(validationNodes)) return []

  const validationEdges = toValidationEdges(edges)
  const ctx: ValidationContext = {
    nodes: validationNodes,
    edges: validationEdges,
    channelCount,
  }

  const laneAdaptNodes = validationNodes.filter(
    (n) =>
      n.data.wfType === "adapt" && inferGraphContext(ctx, n.id) === "lane",
  )
  const soleLaneAdaptRf =
    laneAdaptNodes.length === 1
      ? rfNodes.find((n) => n.id === laneAdaptNodes[0]!.id)
      : undefined
  const singleSharedAdapt =
    laneAdaptNodes.length === 1 &&
    soleLaneAdaptRf != null &&
    !laneIdFromRfNode(soleLaneAdaptRf)

  const errors: string[] = []
  for (const node of rfNodes) {
    if (node.type === "plus_placeholder") continue
    const wfType = node.data.wfType
    if (wfType === "branch" || wfType === "merge") continue
    if (inferGraphContext(ctx, node.id) !== "lane") continue
    if (wfType === "adapt" && singleSharedAdapt) continue
    if (laneIdFromRfNode(node)) continue

    errors.push(
      i18n.t("workflow:validation.laneAssignment", {
        type: wfTypeLabel(wfType),
      }),
    )
  }
  return errors
}

/** Merge HeyGen/video patch; coerce incomplete presenter setup only when setting presenter or clearing avatar. */
export function mergeHeygenVideoConfig(
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...current, ...patch }
  const hasAvatar = Boolean(String(next.heygenAvatarId ?? "").trim())
  const settingPresenterMode = patch.mode === "presenter"
  const clearingAvatar =
    "heygenAvatarId" in patch &&
    !String(patch.heygenAvatarId ?? "").trim()

  if (
    VIDEO_CINEMATIC_UI_ENABLED &&
    next.mode === "presenter" &&
    !hasAvatar &&
    (settingPresenterMode || clearingAvatar)
  ) {
    next.mode = "cinematic"
  }
  return next
}

/** Presenter video nodes need avatar + voice before pipeline run. */
export function getVideoPresenterConfigErrors(
  config: Record<string, unknown> | undefined,
): string[] {
  if (config?.mode !== "presenter") return []
  const errors: string[] = []
  if (!String(config.heygenAvatarId ?? "").trim()) {
    errors.push(i18n.t("workflow:validation.presenterAvatarRequired"))
  }
  if (!String(config.heygenVoiceId ?? "").trim()) {
    errors.push(i18n.t("workflow:validation.presenterVoiceRequired"))
  }
  return errors
}

/** Validate presenter video nodes on the canvas before starting a pipeline. */
export function getVideoPresenterErrorsFromRfNodes(rfNodes: WfRfNode[]): string[] {
  const errors: string[] = []
  for (const n of rfNodes) {
    if (n.type === "plus_placeholder") continue
    const data = n.data as WfNodeData
    if (data.wfType !== "video") continue
    const nodeErrors = getVideoPresenterConfigErrors(data.config)
    const label = data.label?.trim() || n.id
    for (const msg of nodeErrors) {
      errors.push(`${label}: ${msg}`)
    }
  }
  return errors
}
