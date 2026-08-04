import "@xyflow/react/dist/style.css"

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragCancelEvent,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import type { MouseEvent, ReactNode } from "react"
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type NodeChange,
  type OnSelectionChangeParams,
  type OnMoveEnd,
  type ReactFlowInstance,
} from "@xyflow/react"

import {
  apiNodesToRf,
  rfNodeToWfNode,
  type WfRfNode,
} from "@/features/workflow/data/workflow-model"
import {
  filterChannelsBySelection,
  normalizeLaneId,
  type BranchChannelHandle,
  type BranchNodeConfig,
} from "@/features/workflow/lib/branch-channels"
import {
  addNodeAfter,
  addNodeFromPaletteDrop,
  bridgeEdgesAcrossRemovedNode,
  buildPlusEdge,
  deleteBranchCascade,
  insertNodeBetween,
  PLACEHOLDER_NODE_ID,
  repairDirectBranchMergeEdges,
  repairOrphanLaneAdapts,
  syncBranchLanesToChannels,
  replaceInitialPlaceholder,
} from "@/features/workflow/lib/workflow-canvas-mutations"
import {
  WORKFLOW_CANVAS_DROP_ID,
  afterSourceIdFromTarget,
  listPaletteDropHints,
  parsePaletteDragId,
  resolvePaletteDropTarget,
  type PaletteDropTarget,
} from "@/features/workflow/lib/workflow-palette-dnd"
import {
  isPreviewEdgeId,
  persistedLayoutFromApiNodes,
  resolveWorkflowLayout,
} from "@/features/workflow/lib/branch-layout"
import { useWorkflowFlowVisualTheme } from "@/features/workflow/lib/workflow-flow-theme"
import { workflowConfigsEqual } from "@/features/workflow/lib/config-equality"
import { normalizeImageCanvasConfig } from "@/features/workflow/lib/openai-image-size"
import { expandLegacySingleAdapt } from "@/features/workflow/lib/workflow-lane-expand"
import {
  applyWorkflowCanvasViewport,
  defaultWorkflowCanvasViewport,
  writeWorkflowCanvasViewport,
} from "@/features/workflow/lib/workflow-canvas-viewport"
import {
  getAllowedInitialTypes,
  getAllowedInsertTypes,
  getAllowedNextTypes,
  hasBlockingOutgoingEdge,
  mergeHeygenVideoConfig,
  toValidationEdges,
  toValidationNodes,
  type PlusPopoverType,
} from "@/features/workflow/lib/workflow-node-validation"

import type { WorkflowEdge, WorkflowNode } from "@/shared/types/workflow.type"
import { heygenService } from "@/shared/services/heygen.service"
import { usePipelineEstimateQuery } from "@/shared/queries/pipeline.query"
import { toast } from "sonner"
import { NodeSelectPopover } from "./node-select-popover"
import { PlusEdge } from "./plus-edge"
import { PlusPlaceholderNode } from "./plus-placeholder-node"
import { nodeHasConfigurableSettings } from "./workflow-node-config-fields"
import { WorkflowCanvasCreditCard } from "./workflow-canvas-credit-card"
import { WorkflowPropertiesPanel } from "./workflow-properties-panel"
import {
  WorkflowNodePalette,
  WorkflowPaletteDragPreview,
} from "./workflow-node-palette"
import { WorkflowPaletteDropHints } from "./workflow-palette-drop-hints"
import { WorkflowRfNode } from "./workflow-rf-node"
import {
  buildCreditEachByKey,
  creditCostForWfNode,
  estimateCreditsFromCanvasNodes,
} from "@/features/workflow/lib/workflow-node-credit"

const nodeTypes = {
  wfNode: WorkflowRfNode,
  branchNode: WorkflowRfNode,
  mergeNode: WorkflowRfNode,
  plus_placeholder: PlusPlaceholderNode,
}

const edgeTypes = {
  plus_edge: PlusEdge,
}

function flowPositionFromDragEvent(
  event: DragEndEvent | DragMoveEvent,
  screenToFlow: (pos: { x: number; y: number }) => { x: number; y: number },
): { x: number; y: number } | null {
  const activator = event.activatorEvent
  if (!(activator instanceof MouseEvent) && !(activator instanceof TouchEvent)) {
    return null
  }
  let clientX: number
  let clientY: number
  if (activator instanceof MouseEvent) {
    clientX = activator.clientX + event.delta.x
    clientY = activator.clientY + event.delta.y
  } else {
    const touch = activator.changedTouches[0]
    if (!touch) return null
    clientX = touch.clientX + event.delta.x
    clientY = touch.clientY + event.delta.y
  }
  return screenToFlow({ x: clientX, y: clientY })
}

function WorkflowCanvasDropZone({
  children,
  disabled,
}: {
  children: ReactNode
  disabled?: boolean
}) {
  const { setNodeRef } = useDroppable({
    id: WORKFLOW_CANVAS_DROP_ID,
    disabled,
  })
  return (
    <div
      ref={setNodeRef}
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
    >
      {children}
    </div>
  )
}

type PopoverState = {
  mode: "initial" | "after" | "between"
  anchor: { x: number; y: number }
  sourceId?: string
  edgeId?: string
}

/** Validates manual React Flow connections (incl. Branch/Merge multi-handles). */
function connectionFitsDag(
  item: Edge | Connection,
  edges: Edge[],
  nodes: WfRfNode[],
): boolean {
  const source = item.source
  const target = item.target
  if (!source || !target || source === target) return false

  const sourceNode = nodes.find((n) => n.id === source)
  const targetNode = nodes.find((n) => n.id === target)

  if (item.sourceHandle && sourceNode?.type !== "branchNode") return false
  if (item.targetHandle && targetNode?.type !== "mergeNode") return false

  const sh = item.sourceHandle ?? ""
  const th = item.targetHandle ?? ""

  if (item.targetHandle) {
    const taken = edges.some(
      (e) => e.target === target && (e.targetHandle ?? "") === th,
    )
    if (taken) return false
  }

  if (item.sourceHandle && sourceNode?.type === "branchNode") {
    const taken = edges.some(
      (e) => e.source === source && (e.sourceHandle ?? "") === sh,
    )
    if (taken) return false
  }

  if (
    edges.some((e) => {
      if (e.source !== source || e.target !== target) return false
      return (e.sourceHandle ?? "") === sh && (e.targetHandle ?? "") === th
    })
  ) {
    return false
  }

  if (
    item.targetHandle &&
    targetNode?.type === "mergeNode" &&
    sourceNode?.type === "wfNode" &&
    sourceNode.data.wfType === "adapt"
  ) {
    const lane = sourceNode.data.lane?.trim()
    if (lane && normalizeLaneId(lane) !== normalizeLaneId(item.targetHandle)) {
      return false
    }
  }

  return true
}

function anchorFromEvent(event: MouseEvent): { x: number; y: number } {
  return { x: event.clientX, y: event.clientY }
}

export type WorkflowFlowCanvasHandle = {
  getRfNodes: () => WfRfNode[]
  getRfEdges: () => Edge[]
  /** Removes unassigned Adapt nodes and spawns one per channel from Branch. */
  repairOrphanLaneAdapts: () => boolean
  /** Drops nodes that are not connected to any edge in the graph. */
  removeNodesByIds: (nodeIds: string[]) => boolean
  /** Applies open properties-panel draft to canvas nodes. Returns false if validation blocks apply. */
  applyOpenPropertiesPanel: () => boolean
  /** Closes the properties panel and clears unapplied config drafts. */
  dismissPropertiesPanel: () => void
}

type WorkflowFlowCanvasProps = {
  apiNodes?: WorkflowNode[]
  apiEdges?: WorkflowEdge[]
  rfNodesOverride?: WfRfNode[]
  rfEdgesOverride?: Edge[]
  branchChannels?: BranchChannelHandle[]
  /** Every channel the Rule defines (superset of branchChannels) — the checklist's full option list. */
  allChannels?: BranchChannelHandle[]
  channelCount?: number
  showEmptyPlaceholder?: boolean
  readOnly?: boolean
  runtimeById?: Record<string, Record<string, unknown>>
  onRetryNode?: (nodeId: string) => void
  onSkipNode?: (nodeId: string) => void
  onOpenReviewNode?: (nodeId: string) => void
  onSkipReviewNode?: (nodeId: string) => void
  /** Fired when nodes/edges change in edit mode (not selection-only). */
  onCanvasEdited?: () => void
  onConfigDraftChange?: (hasUnappliedChanges: boolean) => void
  /**
   * Fired once after loading, when the persisted branch lane structure no
   * longer matches the rule's current channels and was auto-reconciled
   * (stale lanes dropped, missing lanes spawned). Caller should persist the
   * given nodes/edges so the fix survives future loads.
   */
  onChannelsReconciled?: (
    nodes: WfRfNode[],
    edges: Edge[],
    removedLaneLabels: string[],
  ) => void
  workflowId?: string
  ruleId?: string
}

export const WorkflowFlowCanvas = forwardRef<WorkflowFlowCanvasHandle, WorkflowFlowCanvasProps>(
  function WorkflowFlowCanvas(
    {
      apiNodes,
      apiEdges,
      rfNodesOverride,
      rfEdgesOverride,
      branchChannels = [],
      allChannels = [],
      channelCount = 0,
      showEmptyPlaceholder = false,
      readOnly = false,
      runtimeById = {},
      onRetryNode,
      onSkipNode,
      onOpenReviewNode,
      onSkipReviewNode,
      onCanvasEdited,
      onConfigDraftChange,
      onChannelsReconciled,
      workflowId,
      ruleId,
    },
    ref,
  ) {
    const { t } = useTranslation("workflow")
    const estimateQuery = usePipelineEstimateQuery(
      workflowId,
      ruleId,
      Boolean(workflowId),
    )
    const creditEachByKey = useMemo(
      () =>
        buildCreditEachByKey(
          estimateQuery.data?.breakdown,
          estimateQuery.data?.unitCredits,
        ),
      [estimateQuery.data?.breakdown, estimateQuery.data?.unitCredits],
    )
    const flowTheme = useWorkflowFlowVisualTheme()
    const initialNodes = useMemo(() => [] as WfRfNode[], [])
    const initialEdges = useMemo(() => [] as Edge[], [])
    const defaultViewport = useMemo(() => defaultWorkflowCanvasViewport(), [])

    const [nodes, setNodes, onNodesChange] = useNodesState<WfRfNode>(initialNodes)
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
    const liveEstimate = useMemo(() => {
      if (!estimateQuery.data) return undefined
      return estimateCreditsFromCanvasNodes(
        nodes,
        creditEachByKey,
        estimateQuery.data.creditsRemaining,
      )
    }, [creditEachByKey, estimateQuery.data, nodes])
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [settingsNodeId, setSettingsNodeId] = useState<string | null>(null)
    const [propConfig, setPropConfig] = useState<Record<string, unknown>>({})
    const [popover, setPopover] = useState<PopoverState | null>(null)
    const [paletteDragType, setPaletteDragType] =
      useState<PlusPopoverType | null>(null)
    const [activeDropTarget, setActiveDropTarget] =
      useState<PaletteDropTarget | null>(null)

    const paletteSensors = useSensors(
      useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    )

    const rf = useRef<ReactFlowInstance<WfRfNode> | null>(null)
    const nodesRef = useRef(nodes)
    const edgesRef = useRef(edges)
    const suppressEditNotifyRef = useRef(false)
    nodesRef.current = nodes
    edgesRef.current = edges
    // Read via ref (not a dep) so the hydration effect below doesn't re-run
    // just because the parent passed a fresh (unmemoized) callback identity.
    const onChannelsReconciledRef = useRef(onChannelsReconciled)
    onChannelsReconciledRef.current = onChannelsReconciled
    // Guards the auto-save so it fires at most once per distinct (apiNodes, channels) load.
    const reconciledKeyRef = useRef<string | null>(null)

    const isMaterializedView = Boolean(rfNodesOverride?.length)

    const realNodeCount = useMemo(
      () => nodes.filter((n) => n.type !== "plus_placeholder").length,
      [nodes],
    )

    const validationContext = useMemo(
      () => ({
        nodes: toValidationNodes(nodes),
        edges: toValidationEdges(edges),
        channelCount,
      }),
      [channelCount, edges, nodes],
    )

    const validPopoverTypes = useMemo((): PlusPopoverType[] => {
      if (!popover) return []
      if (popover.mode === "initial") {
        return getAllowedInitialTypes(validationContext)
      }
      if (popover.mode === "after" && popover.sourceId) {
        return getAllowedNextTypes(validationContext, popover.sourceId)
      }
      if (popover.mode === "between" && popover.edgeId) {
        const edge = edges.find((e) => e.id === popover.edgeId)
        if (!edge?.source || !edge.target) return []
        return getAllowedInsertTypes(validationContext, edge.source, edge.target)
      }
      return []
    }, [edges, popover, validationContext])

    const beginApiGraphSync = useCallback(() => {
      suppressEditNotifyRef.current = true
    }, [])

    const endApiGraphSync = useCallback(() => {
      queueMicrotask(() => {
        queueMicrotask(() => {
          suppressEditNotifyRef.current = false
        })
      })
    }, [])

    useEffect(() => {
      if (rfNodesOverride && rfNodesOverride.length > 0) {
        beginApiGraphSync()
        setNodes(rfNodesOverride)
        setEdges(rfEdgesOverride ?? [])
        setSelectedId(null)
        setSettingsNodeId(null)
        setPropConfig({})
        setPopover(null)
        endApiGraphSync()
        queueMicrotask(() => {
          if (rf.current) applyWorkflowCanvasViewport(rf.current)
        })
        return
      }
      if (!apiNodes || apiNodes.length === 0) return
      const { nodes: rfNodes, edges: rfEdges } = apiNodesToRf(apiNodes, apiEdges, {
        channelHandles: branchChannels,
        skipLayout: true,
      })
      const expanded = expandLegacySingleAdapt(rfNodes, rfEdges, branchChannels)
      // Rule channels may have changed since this workflow was last saved (e.g. a
      // channel swapped or removed on the rule): drop lane nodes that no longer
      // match a current rule channel and spawn adapts for channels missing a lane.
      const reconciled = syncBranchLanesToChannels(
        expanded.nodes,
        expanded.edges,
        branchChannels,
      )
      const laidOut = resolveWorkflowLayout(
        reconciled.nodes,
        reconciled.edges,
        branchChannels,
        persistedLayoutFromApiNodes(apiNodes),
      )
      beginApiGraphSync()
      setNodes(laidOut.nodes)
      setEdges(laidOut.edges)
      setSelectedId(null)
      setSettingsNodeId(null)
      setPropConfig({})
      setPopover(null)
      endApiGraphSync()
      queueMicrotask(() => {
        if (rf.current) applyWorkflowCanvasViewport(rf.current)
      })

      if (!readOnly) {
        // Dedupe key: only attempt the auto-save once per distinct
        // (apiNodes snapshot, rule channel set) pairing. Without this, an
        // effect re-run triggered by the save itself (new query data) or by
        // an unrelated parent re-render would recompute and re-fire forever.
        const dedupeKey = `${branchChannels.map((c) => c.id).join(",")}::${apiNodes.length}::${apiNodes.map((n) => `${n.nodeId}:${n.lane ?? ""}`).join("|")}`
        if (reconciledKeyRef.current !== dedupeKey) {
          reconciledKeyRef.current = dedupeKey
          const beforeIds = new Set(expanded.nodes.map((n) => n.id))
          const afterIds = new Set(reconciled.nodes.map((n) => n.id))
          const channelsChanged =
            beforeIds.size !== afterIds.size ||
            [...beforeIds].some((id) => !afterIds.has(id))
          if (channelsChanged) {
            onChannelsReconciledRef.current?.(
              laidOut.nodes,
              laidOut.edges,
              reconciled.removedLaneLabels,
            )
          }
        }
      }
    }, [
      apiNodes,
      apiEdges,
      branchChannels,
      readOnly,
      rfEdgesOverride,
      rfNodesOverride,
      setEdges,
      setNodes,
    ])

    const syncEmptyPlaceholder = useCallback(() => {
      if (readOnly || isMaterializedView || !showEmptyPlaceholder) {
        setNodes((nds) =>
          nds.some((n) => n.type === "plus_placeholder")
            ? nds.filter((n) => n.type !== "plus_placeholder")
            : nds,
        )
        return
      }

      setNodes((nds) => {
        const realNodes = nds.filter((n) => n.type !== "plus_placeholder")
        if (realNodes.length > 0) {
          return realNodes.length === nds.length
            ? nds
            : nds.filter((n) => n.type !== "plus_placeholder")
        }
        if (nds.some((n) => n.type === "plus_placeholder")) return nds
        queueMicrotask(() => void rf.current?.fitView({ padding: 0.15 }))
        return [
          {
            id: PLACEHOLDER_NODE_ID,
            type: "plus_placeholder",
            position: { x: 0, y: 0 },
            data: {},
            draggable: false,
            selectable: true,
            focusable: true,
          },
        ]
      })
    }, [isMaterializedView, readOnly, setNodes, showEmptyPlaceholder])

    useEffect(() => {
      syncEmptyPlaceholder()
    }, [realNodeCount, syncEmptyPlaceholder])

    useEffect(() => {
      if (isMaterializedView || branchChannels.length === 0) return
      beginApiGraphSync()
      setNodes((nds) =>
        nds.map((node) => {
          if (node.type !== "branchNode" && node.type !== "mergeNode") return node
          return {
            ...node,
            data: {
              ...node.data,
              channelHandles: branchChannels,
            },
          }
        }),
      )
      endApiGraphSync()
    }, [
      beginApiGraphSync,
      branchChannels,
      endApiGraphSync,
      isMaterializedView,
      setNodes,
    ])

    const closePanel = useCallback(() => {
      setNodes((nds) => nds.map((n) => ({ ...n, selected: false })))
      setSettingsNodeId(null)
      setPropConfig({})
    }, [setNodes])

    const openSettingsPanel = useCallback(
      (nodeId: string) => {
        const n = nodes.find((entry) => entry.id === nodeId)
        if (
          !n ||
          n.type === "plus_placeholder" ||
          (n.type !== "wfNode" &&
            n.type !== "branchNode" &&
            n.type !== "mergeNode")
        ) {
          return
        }
        setSettingsNodeId(nodeId)
        setPropConfig((n.data.config as Record<string, unknown>) ?? {})
        setNodes((nds) =>
          nds.map((node) => ({
            ...node,
            selected: node.id === nodeId,
          })),
        )
      },
      [nodes, setNodes],
    )

    const closePopover = useCallback(() => setPopover(null), [])

    const notifyCanvasEdited = useCallback(() => {
      if (!readOnly && !isMaterializedView) onCanvasEdited?.()
    }, [isMaterializedView, onCanvasEdited, readOnly])

    const openInitialPopover = useCallback((event: MouseEvent) => {
      setPopover({ mode: "initial", anchor: anchorFromEvent(event) })
    }, [])

    const openAfterPopover = useCallback((event: MouseEvent, sourceId: string) => {
      setPopover({ mode: "after", anchor: anchorFromEvent(event), sourceId })
    }, [])

    const openBetweenPopover = useCallback(
      (event: MouseEvent, edgeId: string, labelX: number, labelY: number) => {
        const anchor = rf.current
          ? rf.current.flowToScreenPosition({ x: labelX, y: labelY })
          : anchorFromEvent(event)
        setPopover({ mode: "between", anchor, edgeId })
      },
      [],
    )

    const handlePaletteDragStart = useCallback((event: DragStartEvent) => {
      const wfType = parsePaletteDragId(event.active.id)
      if (wfType) {
        setPaletteDragType(wfType)
        setActiveDropTarget(null)
      }
    }, [])

    const handlePaletteDragMove = useCallback(
      (event: DragMoveEvent) => {
        const wfType = parsePaletteDragId(event.active.id)
        if (!wfType) return
        const inst = rf.current
        if (!inst) return
        const flowPosition = flowPositionFromDragEvent(event, (pos) =>
          inst.screenToFlowPosition(pos),
        )
        if (!flowPosition) {
          setActiveDropTarget(null)
          return
        }
        const target = resolvePaletteDropTarget(
          flowPosition,
          wfType,
          nodesRef.current,
          edgesRef.current,
          channelCount,
        )
        setActiveDropTarget(target)
      },
      [channelCount],
    )

    const handlePaletteDragCancel = useCallback((_event: DragCancelEvent) => {
      setPaletteDragType(null)
      setActiveDropTarget(null)
    }, [])

    const handlePaletteDragEnd = useCallback(
      (event: DragEndEvent) => {
        setPaletteDragType(null)
        setActiveDropTarget(null)
        if (readOnly || isMaterializedView) return
        const { active, over } = event
        if (!over || over.id !== WORKFLOW_CANVAS_DROP_ID) return

        const wfType = parsePaletteDragId(active.id)
        if (!wfType) return

        const inst = rf.current
        if (!inst) return

        const flowPosition = flowPositionFromDragEvent(event, (pos) =>
          inst.screenToFlowPosition(pos),
        )
        if (!flowPosition) return

        const target = resolvePaletteDropTarget(
          flowPosition,
          wfType,
          nodesRef.current,
          edgesRef.current,
          channelCount,
        )
        if (!target) {
          toast.error(t("canvas.cannotAddNode"))
          return
        }

        const created = addNodeFromPaletteDrop({
          wfType,
          flowPosition,
          target,
          nodes: nodesRef.current,
          edges: edgesRef.current,
          setNodes,
          setEdges,
          branchChannels,
        })
        if (!created) {
          toast.error(t("canvas.cannotAddNode"))
          return
        }

        notifyCanvasEdited()
        if (target.mode === "initial") {
          queueMicrotask(() => void inst.fitView({ padding: 0.15 }))
        }
        queueMicrotask(() => syncEmptyPlaceholder())
      },
      [
        branchChannels,
        channelCount,
        isMaterializedView,
        notifyCanvasEdited,
        readOnly,
        setEdges,
        setNodes,
        syncEmptyPlaceholder,
        t,
      ],
    )

    const handlePopoverSelect = useCallback(
      (wfType: PlusPopoverType) => {
        if (!popover) return
        const branchOpts = { branchChannels }

        if (popover.mode === "initial") {
          replaceInitialPlaceholder({ wfType, setNodes, ...branchOpts })
          queueMicrotask(() => void rf.current?.fitView({ padding: 0.15 }))
        } else if (popover.mode === "after" && popover.sourceId) {
          addNodeAfter({
            sourceId: popover.sourceId,
            wfType,
            nodes: nodesRef.current,
            edges: edgesRef.current,
            setNodes,
            setEdges,
            ...branchOpts,
          })
        } else if (popover.mode === "between" && popover.edgeId) {
          insertNodeBetween({
            edgeId: popover.edgeId,
            wfType,
            nodes: nodesRef.current,
            edges: edgesRef.current,
            setNodes,
            setEdges,
            ...branchOpts,
          })
        }
        setPopover(null)
        notifyCanvasEdited()
      },
      [branchChannels, notifyCanvasEdited, popover, setEdges, setNodes],
    )

    const dropHints = useMemo(() => {
      if (!paletteDragType) return []
      return listPaletteDropHints(
        paletteDragType,
        nodes,
        edges,
        channelCount,
      )
    }, [channelCount, edges, nodes, paletteDragType])

    const afterSourceIds = useMemo(
      () =>
        new Set(
          dropHints
            .filter((h) => h.mode === "after")
            .map((h) => h.sourceId),
        ),
      [dropHints],
    )

    const betweenEdgeIds = useMemo(
      () =>
        new Set(
          dropHints
            .filter((h) => h.mode === "between")
            .map((h) => h.edgeId),
        ),
      [dropHints],
    )

    const showInitialDropHint = dropHints.some((h) => h.mode === "initial")
    const activeAfterSourceId = afterSourceIdFromTarget(activeDropTarget)
    const activeBetweenEdgeId =
      activeDropTarget?.mode === "between" ? activeDropTarget.edgeId : null

    const edgesWithHandlers = useMemo(
      () =>
        edges.map((edge) => ({
          ...edge,
          type: edge.type ?? "plus_edge",
          style: {
            strokeWidth: 2,
            ...edge.style,
            stroke: flowTheme.edgeColor,
          },
          data: {
            ...edge.data,
            readOnly,
            paletteDropHighlight: betweenEdgeIds.has(edge.id),
            paletteDropActive: activeBetweenEdgeId === edge.id,
            onInsert: readOnly
              ? undefined
              : (event: MouseEvent, labelX: number, labelY: number) => {
                  openBetweenPopover(event, edge.id, labelX, labelY)
                },
          },
        })),
      [
        activeBetweenEdgeId,
        betweenEdgeIds,
        edges,
        flowTheme.edgeColor,
        openBetweenPopover,
        readOnly,
      ],
    )

    const displayEdges = edgesWithHandlers

    const handleNodesChange = useCallback(
      (changes: NodeChange<WfRfNode>[]) => {
        const structural = changes.some(
          (change) => change.type !== "select" && change.type !== "dimensions",
        )
        onNodesChange(changes)
        if (structural) notifyCanvasEdited()
        const removedIds = changes
          .filter((change) => change.type === "remove")
          .map((change) => change.id)
        if (removedIds.length === 0) return
        setEdges((eds) =>
          eds.filter(
            (edge) =>
              !removedIds.includes(edge.source) &&
              !removedIds.includes(edge.target),
          ),
        )
        if (selectedId && removedIds.includes(selectedId)) {
          setSelectedId(null)
        }
        if (settingsNodeId && removedIds.includes(settingsNodeId)) {
          setSettingsNodeId(null)
          setPropConfig({})
        }
      },
      [notifyCanvasEdited, onNodesChange, setEdges, selectedId, settingsNodeId],
    )

    const isValidConnection = useCallback(
      (item: Edge | Connection) =>
        connectionFitsDag(item, edges, nodesRef.current),
      [edges],
    )

    const onConnect = useCallback(
      (params: Connection) => {
        if (readOnly || !params.source || !params.target) return
        if (
          !connectionFitsDag(params, edgesRef.current, nodesRef.current)
        ) {
          return
        }
        setEdges((eds) =>
          addEdge(
            buildPlusEdge(params.source, params.target, {
              ...(params.sourceHandle
                ? { sourceHandle: params.sourceHandle }
                : {}),
              ...(params.targetHandle
                ? { targetHandle: params.targetHandle }
                : {}),
            }),
            eds,
          ),
        )
        notifyCanvasEdited()
      },
      [notifyCanvasEdited, readOnly, setEdges],
    )

    const onSelectionChange = useCallback((p: OnSelectionChangeParams<WfRfNode>) => {
      const n = p.nodes[0]
      if (!n || n.type === "plus_placeholder") {
        setSelectedId(null)
        return
      }
      setSelectedId(n.id)
    }, [])

    const onNodeClick = useCallback(
      (event: MouseEvent, node: WfRfNode) => {
        if (node.type === "plus_placeholder") {
          if (readOnly) return
          setPopover({ mode: "initial", anchor: anchorFromEvent(event) })
          return
        }
        if (
          node.data.status === "waiting_review" &&
          onOpenReviewNode
        ) {
          onOpenReviewNode(node.id)
        }
      },
      [onOpenReviewNode, readOnly],
    )

    const persistedNodeIds = useMemo(
      () => new Set((apiNodes ?? []).map((node) => node.nodeId)),
      [apiNodes],
    )

    const selNode = useMemo(() => {
      const n = nodes.find((x) => x.id === settingsNodeId)
      if (
        !n ||
        n.type === "plus_placeholder" ||
        (n.type !== "wfNode" && n.type !== "branchNode" && n.type !== "mergeNode")
      ) {
        return null
      }
      return rfNodeToWfNode(n)
    }, [nodes, settingsNodeId])

    const syncVideoConfigToCanvas = useCallback(
      (config: Record<string, unknown>) => {
        if (readOnly || !settingsNodeId) return
        const selected = nodesRef.current.find((n) => n.id === settingsNodeId)
        if (selected?.type !== "wfNode" || selected.data.wfType !== "video") {
          return
        }
        const configToApply = mergeHeygenVideoConfig({}, config)
        const nextNodes = nodesRef.current.map((n) => {
          if (n.id !== settingsNodeId || n.type === "plus_placeholder") return n
          return {
            ...n,
            data: {
              ...n.data,
              config: configToApply,
            },
          } as WfRfNode
        })
        nodesRef.current = nextNodes
        setNodes(nextNodes)
        setPropConfig(configToApply)
        onConfigDraftChange?.(false)
        if (
          workflowId?.trim() &&
          persistedNodeIds.has(settingsNodeId)
        ) {
          void heygenService
            .patchPresenterConfig(workflowId, settingsNodeId, configToApply)
            .catch(() => {
              toast.error(t("canvas.videoSettingsSaveFailed"))
            })
        }
      },
      [
        onConfigDraftChange,
        persistedNodeIds,
        readOnly,
        settingsNodeId,
        setNodes,
        t,
        workflowId,
      ],
    )

    const handlePropConfigChange = useCallback(
      (next: Record<string, unknown>) => {
        setPropConfig(next)
        if (selNode?.type === "video") {
          syncVideoConfigToCanvas(next)
        }
      },
      [selNode?.type, syncVideoConfigToCanvas],
    )

    useEffect(() => {
      if (!selNode || readOnly) {
        onConfigDraftChange?.(false)
        return
      }
      onConfigDraftChange?.(
        !workflowConfigsEqual(propConfig, selNode.config ?? {}),
      )
    }, [onConfigDraftChange, propConfig, readOnly, selNode])

    const onInit = useCallback((inst: ReactFlowInstance<WfRfNode>) => {
      rf.current = inst
      queueMicrotask(() => applyWorkflowCanvasViewport(inst))
    }, [])

    const onMoveEnd = useCallback<OnMoveEnd>(
      (_event, viewport) => {
        writeWorkflowCanvasViewport(viewport)
      },
      [],
    )

    const deleteNode = useCallback(
      (nodeId: string) => {
        if (readOnly) return
        const node = nodes.find((entry) => entry.id === nodeId)
        if (!node) return

        if (node.type === "branchNode") {
          deleteBranchCascade({
            branchId: nodeId,
            nodes: nodesRef.current,
            edges: edgesRef.current,
            setNodes,
            setEdges,
          })
        } else {
          const nextNodes = nodesRef.current.filter(
            (entry) => entry.id !== nodeId,
          )
          const bridgedEdges = bridgeEdgesAcrossRemovedNode(
            nodeId,
            edgesRef.current,
          )
          const repaired = repairDirectBranchMergeEdges(
            nextNodes,
            bridgedEdges,
            branchChannels,
          )
          setNodes(repaired.nodes)
          setEdges(repaired.edges)
        }

        if (selectedId === nodeId) setSelectedId(null)
        if (settingsNodeId === nodeId) closePanel()
        notifyCanvasEdited()
        queueMicrotask(() => syncEmptyPlaceholder())
      },
      [
        readOnly,
        nodes,
        branchChannels,
        selectedId,
        settingsNodeId,
        closePanel,
        notifyCanvasEdited,
        setEdges,
        setNodes,
        syncEmptyPlaceholder,
      ],
    )

    useEffect(() => {
      if (!selectedId) return
      const handler = (event: KeyboardEvent) => {
        if (event.key !== "Delete" && event.key !== "Backspace") return
        const target = event.target as HTMLElement | null
        if (
          target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable)
        ) {
          return
        }
        deleteNode(selectedId)
      }
      window.addEventListener("keydown", handler)
      return () => window.removeEventListener("keydown", handler)
    }, [selectedId, deleteNode])

    const nodesWithActions = useMemo(() => {
      const validationNodes = toValidationNodes(nodes)
      const allEdges = edges

      return nodes.map((node) => {
        if (node.type === "plus_placeholder") {
          return {
            ...node,
            data: {
              onOpenPopover: readOnly ? undefined : openInitialPopover,
              paletteDropHighlight: showInitialDropHint,
            },
          }
        }

        const wfType = node.data.wfType
        let showAddButton = false

        if (!readOnly && wfType !== "merge") {
          if (node.type === "branchNode") {
            showAddButton = false
          } else if (
            wfType === "keywords" ||
            wfType === "intelligence" ||
            wfType === "transcription" ||
            wfType === "summarization" ||
            wfType === "adapt" ||
            wfType === "text" ||
            wfType === "image" ||
            wfType === "video" ||
            wfType === "translation"
          ) {
            showAddButton = !hasBlockingOutgoingEdge(
              node.id,
              allEdges,
              validationNodes,
            )
          }
        }

        const hasBranch =
          node.type !== "branchNode" &&
          nodes.some((n) => n.type === "branchNode")
        const runtime = runtimeById[node.id]

        const creditCost = creditCostForWfNode(
          wfType,
          node.data.config,
          creditEachByKey,
        )

        return {
          ...node,
          data: {
            ...node.data,
            ...runtimeById[node.id],
            readOnly,
            creditCost,
            onDelete:
              readOnly || (node.type === "mergeNode" && hasBranch)
                ? undefined
                : () => deleteNode(node.id),
            onOpenSettings:
              readOnly ||
              (!nodeHasConfigurableSettings(wfType) && wfType !== "branch")
                ? undefined
                : () => {
                    if (settingsNodeId === node.id) {
                      closePanel()
                      return
                    }
                    openSettingsPanel(node.id)
                  },
            settingsOpen: settingsNodeId === node.id,
            onRetry: onRetryNode ? () => onRetryNode(node.id) : undefined,
            onSkip: onSkipNode ? () => onSkipNode(node.id) : undefined,
            onOpenReview:
              runtime?.status === "waiting_review" && onOpenReviewNode
                ? () => onOpenReviewNode(node.id)
                : undefined,
            onSkipReview:
              runtime?.status === "waiting_review" && onSkipReviewNode
                ? () => onSkipReviewNode(node.id)
                : undefined,
            onOpenAddPopover: showAddButton
              ? (event: MouseEvent) => openAfterPopover(event, node.id)
              : undefined,
            paletteDropAfterHighlight: afterSourceIds.has(node.id),
            paletteDropAfterActive: activeAfterSourceId === node.id,
          },
        }
      })
    }, [
      activeAfterSourceId,
      afterSourceIds,
      channelCount,
      creditEachByKey,
      deleteNode,
      edges,
      nodes,
      onRetryNode,
      onSkipNode,
      onOpenReviewNode,
      onSkipReviewNode,
      closePanel,
      openAfterPopover,
      openInitialPopover,
      openSettingsPanel,
      readOnly,
      runtimeById,
      settingsNodeId,
      showInitialDropHint,
    ])

    const applyChanges = useCallback((): boolean => {
      if (readOnly) return true
      if (!settingsNodeId) return true
      const currentNodes = nodesRef.current
      const selected = currentNodes.find((n) => n.id === settingsNodeId)
      if (selected?.type === "plus_placeholder") return true
      let configToApply: Record<string, unknown> = propConfig
      if (selected?.type === "wfNode" && selected.data.wfType === "image") {
        const { config: normalized, sizeAdjusted } =
          normalizeImageCanvasConfig(propConfig)
        configToApply = normalized
        if (sizeAdjusted) {
          toast.info(t("canvas.imageSizeAdjusted"))
        }
      }
      if (selected?.type === "wfNode" && selected.data.wfType === "video") {
        configToApply = mergeHeygenVideoConfig({}, propConfig)
      }
      let nextNodes = currentNodes
      let nextEdges = edgesRef.current
      if (selected?.data.wfType === "branch") {
        const activeChannels = filterChannelsBySelection(
          allChannels,
          configToApply as BranchNodeConfig,
        )
        const synced = syncBranchLanesToChannels(
          currentNodes,
          nextEdges,
          activeChannels,
        )
        nextNodes = synced.nodes.map((n) => {
          if (n.id !== settingsNodeId || n.type === "plus_placeholder") return n
          return {
            ...n,
            data: {
              ...n.data,
              config: configToApply,
            },
          } as WfRfNode
        })
        nextEdges = synced.edges
        if (synced.removedLaneLabels.length > 0) {
          toast.info(
            t("canvas.removedLanes", {
              lanes: synced.removedLaneLabels.join(", "),
            }),
          )
        }
        edgesRef.current = nextEdges
        setEdges(nextEdges)
      } else {
        nextNodes = currentNodes.map((n) => {
          if (n.id !== settingsNodeId || n.type === "plus_placeholder") return n
          return {
            ...n,
            data: {
              ...n.data,
              config: configToApply,
            },
          } as WfRfNode
        })
      }
      nodesRef.current = nextNodes
      setNodes(nextNodes)
      setPropConfig(configToApply)
      onConfigDraftChange?.(false)
      if (
        workflowId?.trim() &&
        persistedNodeIds.has(settingsNodeId) &&
        selected?.type === "wfNode" &&
        selected.data.wfType === "video"
      ) {
        void heygenService
          .patchPresenterConfig(workflowId, settingsNodeId, configToApply)
          .catch(() => {
            toast.error(t("canvas.videoSettingsSaveFailed"))
          })
      }
      return true
    }, [
      allChannels,
      onConfigDraftChange,
      propConfig,
      readOnly,
      settingsNodeId,
      setEdges,
      setNodes,
      setPropConfig,
      t,
      workflowId,
      persistedNodeIds,
    ])

    const applyOpenPropertiesPanel = useCallback((): boolean => {
      if (readOnly || !settingsNodeId) return true
      const selected = nodesRef.current.find((n) => n.id === settingsNodeId)
      if (
        !selected ||
        selected.type === "plus_placeholder" ||
        (selected.type !== "wfNode" &&
          selected.type !== "branchNode" &&
          selected.type !== "mergeNode")
      ) {
        return true
      }
      const currentConfig = selected.data.config ?? {}
      if (workflowConfigsEqual(propConfig, currentConfig)) return true
      return applyChanges()
    }, [applyChanges, propConfig, readOnly, settingsNodeId])

    useImperativeHandle(
      ref,
      () => ({
        getRfNodes: () => nodesRef.current,
        getRfEdges: () =>
          edgesRef.current.filter((edge) => !isPreviewEdgeId(edge.id)),
        repairOrphanLaneAdapts: () => {
          const result = repairOrphanLaneAdapts(
            nodesRef.current,
            edgesRef.current,
            branchChannels,
          )
          if (!result.repaired) return false
          nodesRef.current = result.nodes
          edgesRef.current = result.edges
          setNodes(result.nodes)
          setEdges(result.edges)
          return true
        },
        removeNodesByIds: (nodeIds: string[]) => {
          if (nodeIds.length === 0) return false
          const idSet = new Set(nodeIds)
          const nextNodes = nodesRef.current.filter((node) => !idSet.has(node.id))
          if (nextNodes.length === nodesRef.current.length) return false
          const nextEdges = edgesRef.current.filter(
            (edge) => !idSet.has(edge.source) && !idSet.has(edge.target),
          )
          nodesRef.current = nextNodes
          edgesRef.current = nextEdges
          setNodes(nextNodes)
          setEdges(nextEdges)
          if (settingsNodeId && idSet.has(settingsNodeId)) {
            setSettingsNodeId(null)
            setPropConfig({})
          }
          if (selectedId && idSet.has(selectedId)) {
            setSelectedId(null)
          }
          return true
        },
        applyOpenPropertiesPanel,
        dismissPropertiesPanel: closePanel,
      }),
      [applyOpenPropertiesPanel, branchChannels, closePanel, selectedId, settingsNodeId, setEdges, setNodes],
    )

    const showPalette = !readOnly && !isMaterializedView

    return (
      <DndContext
        sensors={paletteSensors}
        onDragStart={showPalette ? handlePaletteDragStart : undefined}
        onDragMove={showPalette ? handlePaletteDragMove : undefined}
        onDragCancel={showPalette ? handlePaletteDragCancel : undefined}
        onDragEnd={showPalette ? handlePaletteDragEnd : undefined}
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-row overflow-hidden">
          {showPalette ? <WorkflowNodePalette /> : null}
          <WorkflowCanvasDropZone disabled={!showPalette}>
            <ReactFlow<WfRfNode>
            nodes={nodesWithActions}
            edges={displayEdges}
            onNodesChange={readOnly ? onNodesChange : handleNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={readOnly ? undefined : onConnect}
            onSelectionChange={onSelectionChange}
            onNodeClick={onNodeClick}
            onPaneClick={() => closePanel()}
            onInit={onInit}
            onMoveEnd={onMoveEnd}
            nodesFocusable={false}
            selectNodesOnDrag={false}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            isValidConnection={isValidConnection}
            minZoom={0.35}
            maxZoom={1.5}
            defaultViewport={defaultViewport}
            className="workflow-flow-canvas h-full min-h-0 w-full flex-1 bg-muted/10! dark:bg-transparent!"
            style={{ width: "100%", height: "100%" }}
          >
            <Background
              gap={24}
              size={1}
              // color={flowTheme.backgroundDotColor}
            />
            <Controls
              className="border-(--nt-border)! shadow-md!"
              showInteractive={false}
            />
            <MiniMap
              className="rounded-lg! border! border-(--nt-border)! bg-card! shadow-md!"
              maskColor={flowTheme.minimapMaskColor}
              nodeStrokeWidth={2}
              zoomable
              pannable
            />
            {workflowId ? (
              <Panel position="top-left" className="m-3!">
                <WorkflowCanvasCreditCard
                  estimate={liveEstimate ?? estimateQuery.data}
                  loading={
                    estimateQuery.isLoading ||
                    (estimateQuery.isFetching && !estimateQuery.data)
                  }
                  error={estimateQuery.isError}
                />
              </Panel>
            ) : null}
            {paletteDragType ? (
              <WorkflowPaletteDropHints
                hints={dropHints}
                activeTarget={activeDropTarget}
                nodes={nodes}
              />
            ) : null}
          </ReactFlow>
          </WorkflowCanvasDropZone>

          <WorkflowPropertiesPanel
            open={Boolean(selNode) && !readOnly}
            onOpenChange={(nextOpen) => {
              if (!nextOpen) closePanel()
            }}
            selNode={selNode}
            propConfig={propConfig}
            setPropConfig={handlePropConfigChange}
            nodePersisted={selNode ? persistedNodeIds.has(selNode.id) : false}
            allChannels={allChannels}
            workflowId={workflowId}
            onApply={applyChanges}
            onReset={() => {
              if (selNode) setPropConfig(selNode.config ?? {})
            }}
          />

          <NodeSelectPopover
            open={popover != null}
            anchorPosition={popover?.anchor ?? { x: 0, y: 0 }}
            validNodeTypes={validPopoverTypes}
            onSelect={handlePopoverSelect}
            onClose={closePopover}
          />
        </div>

        {showPalette && paletteDragType ? (
          <DragOverlay dropAnimation={null}>
            <WorkflowPaletteDragPreview wfType={paletteDragType} />
          </DragOverlay>
        ) : null}
      </DndContext>
    )
  },
)
