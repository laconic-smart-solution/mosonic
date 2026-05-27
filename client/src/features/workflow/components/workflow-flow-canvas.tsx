import "@xyflow/react/dist/style.css"

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import type { MouseEvent, ReactNode } from "react"
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type NodeChange,
  type OnSelectionChangeParams,
  type ReactFlowInstance,
} from "@xyflow/react"

import {
  apiNodesToRf,
  rfNodeToWfNode,
  type WfRfNode,
} from "@/features/workflow/data/workflow-model"
import {
  normalizeLaneId,
  type BranchChannelHandle,
} from "@/features/workflow/lib/branch-channels"
import {
  addNodeAfter,
  addNodeFromPaletteDrop,
  buildPlusEdge,
  deleteBranchCascade,
  insertNodeBetween,
  PLACEHOLDER_NODE_ID,
  repairOrphanLaneAdapts,
  syncBranchLanesToChannels,
  replaceInitialPlaceholder,
} from "@/features/workflow/lib/workflow-canvas-mutations"
import {
  WORKFLOW_CANVAS_DROP_ID,
  parsePaletteDragId,
  resolvePaletteDropTarget,
} from "@/features/workflow/lib/workflow-palette-dnd"
import {
  isPreviewEdgeId,
  persistedLayoutFromApiNodes,
  resolveWorkflowLayout,
} from "@/features/workflow/lib/branch-layout"
import { workflowConfigsEqual } from "@/features/workflow/lib/config-equality"
import { normalizeImageCanvasConfig } from "@/features/workflow/lib/openai-image-size"
import { expandLegacySingleAdapt } from "@/features/workflow/lib/workflow-lane-expand"
import {
  branchHasAllLaneAdapts,
  getAllowedInitialTypes,
  getAllowedInsertTypes,
  getAllowedNextTypes,
  hasBlockingOutgoingEdge,
  toValidationEdges,
  toValidationNodes,
  type PlusPopoverType,
} from "@/features/workflow/lib/workflow-node-validation"

import type { WorkflowEdge, WorkflowNode } from "@/shared/types/workflow.type"
import { heygenService } from "@/shared/services/heygen.service"
import { toast } from "sonner"
import { NodeSelectPopover } from "./node-select-popover"
import { PlusEdge } from "./plus-edge"
import { PlusPlaceholderNode } from "./plus-placeholder-node"
import { WorkflowBranchNode } from "./workflow-branch-node"
import { WorkflowMergeNode } from "./workflow-merge-node"
import { WorkflowPropertiesPanel } from "./workflow-properties-panel"
import {
  WorkflowNodePalette,
  WorkflowPaletteDragPreview,
} from "./workflow-node-palette"
import { WorkflowRfNode } from "./workflow-rf-node"

const nodeTypes = {
  wfNode: WorkflowRfNode,
  branchNode: WorkflowBranchNode,
  mergeNode: WorkflowMergeNode,
  plus_placeholder: PlusPlaceholderNode,
}

const edgeTypes = {
  plus_edge: PlusEdge,
}

function flowPositionFromDragEnd(
  event: DragEndEvent,
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
  /** Closes the properties panel and clears unapplied config drafts. */
  dismissPropertiesPanel: () => void
}

type WorkflowFlowCanvasProps = {
  apiNodes?: WorkflowNode[]
  apiEdges?: WorkflowEdge[]
  rfNodesOverride?: WfRfNode[]
  rfEdgesOverride?: Edge[]
  branchChannels?: BranchChannelHandle[]
  resolvedChannels?: BranchChannelHandle[]
  channelCount?: number
  showEmptyPlaceholder?: boolean
  readOnly?: boolean
  runtimeById?: Record<string, Record<string, unknown>>
  onRetryNode?: (nodeId: string) => void
  onSkipNode?: (nodeId: string) => void
  /** Fired when nodes/edges change in edit mode (not selection-only). */
  onCanvasEdited?: () => void
  onConfigDraftChange?: (hasUnappliedChanges: boolean) => void
  workflowId?: string
}

export const WorkflowFlowCanvas = forwardRef<WorkflowFlowCanvasHandle, WorkflowFlowCanvasProps>(
  function WorkflowFlowCanvas(
    {
      apiNodes,
      apiEdges,
      rfNodesOverride,
      rfEdgesOverride,
      branchChannels = [],
      resolvedChannels = [],
      channelCount = 0,
      showEmptyPlaceholder = false,
      readOnly = false,
      runtimeById = {},
      onRetryNode,
      onSkipNode,
      onCanvasEdited,
      onConfigDraftChange,
      workflowId,
    },
    ref,
  ) {
    const initialNodes = useMemo(() => [] as WfRfNode[], [])
    const initialEdges = useMemo(() => [] as Edge[], [])

    const [nodes, setNodes, onNodesChange] = useNodesState<WfRfNode>(initialNodes)
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [propConfig, setPropConfig] = useState<Record<string, unknown>>({})
    const [popover, setPopover] = useState<PopoverState | null>(null)
    const [paletteDragType, setPaletteDragType] =
      useState<PlusPopoverType | null>(null)

    const paletteSensors = useSensors(
      useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    )

    const rf = useRef<ReactFlowInstance<WfRfNode> | null>(null)
    const nodesRef = useRef(nodes)
    const edgesRef = useRef(edges)
    const suppressEditNotifyRef = useRef(false)
    nodesRef.current = nodes
    edgesRef.current = edges

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
        setPropConfig({})
        setPopover(null)
        endApiGraphSync()
        queueMicrotask(() => void rf.current?.fitView({ padding: 0.15 }))
        return
      }
      if (!apiNodes || apiNodes.length === 0) return
      const { nodes: rfNodes, edges: rfEdges } = apiNodesToRf(apiNodes, apiEdges, {
        channelHandles: branchChannels,
        skipLayout: true,
      })
      const expanded = expandLegacySingleAdapt(rfNodes, rfEdges, branchChannels)
      const laidOut = resolveWorkflowLayout(
        expanded.nodes,
        expanded.edges,
        branchChannels,
        persistedLayoutFromApiNodes(apiNodes),
      )
      beginApiGraphSync()
      setNodes(laidOut.nodes)
      setEdges(laidOut.edges)
      setSelectedId(null)
      setPropConfig({})
      setPopover(null)
      endApiGraphSync()
      queueMicrotask(() => void rf.current?.fitView({ padding: 0.15 }))
    }, [
      apiNodes,
      apiEdges,
      branchChannels,
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
      setSelectedId(null)
      setPropConfig({})
    }, [setNodes])

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
          setNodes(result.nodes)
          setEdges(result.edges)
          return true
        },
        dismissPropertiesPanel: closePanel,
      }),
      [branchChannels, closePanel, setEdges, setNodes],
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
      if (wfType) setPaletteDragType(wfType)
    }, [])

    const handlePaletteDragEnd = useCallback(
      (event: DragEndEvent) => {
        setPaletteDragType(null)
        if (readOnly || isMaterializedView) return
        const { active, over } = event
        if (!over || over.id !== WORKFLOW_CANVAS_DROP_ID) return

        const wfType = parsePaletteDragId(active.id)
        if (!wfType) return

        const inst = rf.current
        if (!inst) return

        const flowPosition = flowPositionFromDragEnd(event, (pos) =>
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
          toast.error("Cannot add this node here")
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
          toast.error("Cannot add this node here")
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

    const edgesWithHandlers = useMemo(
      () =>
        edges.map((edge) => ({
          ...edge,
          type: edge.type ?? "plus_edge",
          data: {
            ...edge.data,
            readOnly,
            onInsert: readOnly
              ? undefined
              : (event: MouseEvent, labelX: number, labelY: number) => {
                  openBetweenPopover(event, edge.id, labelX, labelY)
                },
          },
        })),
      [edges, openBetweenPopover, readOnly],
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
          setPropConfig({})
        }
      },
      [notifyCanvasEdited, onNodesChange, setEdges, selectedId],
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
        setPropConfig({})
        return
      }
      setSelectedId(n.id)
      setPropConfig((n.data.config as Record<string, unknown>) ?? {})
    }, [])

    const onNodeClick = useCallback(
      (event: MouseEvent, node: WfRfNode) => {
        if (readOnly || node.type !== "plus_placeholder") return
        setPopover({ mode: "initial", anchor: anchorFromEvent(event) })
      },
      [readOnly],
    )

    const selNode = useMemo(() => {
      const n = nodes.find((x) => x.id === selectedId)
      if (
        !n ||
        n.type === "plus_placeholder" ||
        (n.type !== "wfNode" && n.type !== "branchNode" && n.type !== "mergeNode")
      ) {
        return null
      }
      return rfNodeToWfNode(n)
    }, [nodes, selectedId])

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
      queueMicrotask(() => void inst.fitView({ padding: 0.15 }))
    }, [])

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
          setNodes((nds) => nds.filter((entry) => entry.id !== nodeId))
          setEdges((eds) =>
            eds.filter(
              (edge) => edge.source !== nodeId && edge.target !== nodeId,
            ),
          )
        }

        if (selectedId === nodeId) closePanel()
        notifyCanvasEdited()
        queueMicrotask(() => syncEmptyPlaceholder())
      },
      [
        readOnly,
        nodes,
        selectedId,
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
            },
          }
        }

        const wfType = node.data.wfType
        let showAddButton = false

        if (!readOnly && wfType !== "merge") {
          if (node.type === "branchNode") {
            showAddButton = !branchHasAllLaneAdapts(channelCount, validationNodes)
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

        return {
          ...node,
          data: {
            ...node.data,
            ...runtimeById[node.id],
            readOnly,
            onDelete:
              readOnly || (node.type === "mergeNode" && hasBranch)
                ? undefined
                : () => deleteNode(node.id),
            onRetry: onRetryNode ? () => onRetryNode(node.id) : undefined,
            onSkip: onSkipNode ? () => onSkipNode(node.id) : undefined,
            onOpenAddPopover: showAddButton
              ? (event: MouseEvent) => openAfterPopover(event, node.id)
              : undefined,
          },
        }
      })
    }, [
      channelCount,
      deleteNode,
      edges,
      nodes,
      onRetryNode,
      onSkipNode,
      openAfterPopover,
      openInitialPopover,
      readOnly,
      runtimeById,
    ])

    const applyChanges = useCallback(() => {
      if (readOnly) return
      if (!selectedId) return
      const selected = nodes.find((n) => n.id === selectedId)
      if (selected?.type === "plus_placeholder") return
      let configToApply: Record<string, unknown> = propConfig
      if (selected?.data.wfType === "branch") {
        configToApply = { mode: "rule_channels" }
      }
      if (selected?.type === "wfNode" && selected.data.wfType === "image") {
        const { config: normalized, sizeAdjusted } =
          normalizeImageCanvasConfig(propConfig)
        configToApply = normalized
        if (sizeAdjusted) {
          toast.info(
            "Image size was adjusted to match the selected model (OpenAI only allows certain dimensions).",
          )
        }
      }
      let nextNodes = nodes
      let nextEdges = edgesRef.current
      if (selected?.data.wfType === "branch") {
        const synced = syncBranchLanesToChannels(nodes, nextEdges, branchChannels)
        nextNodes = synced.nodes.map((n) => {
          if (n.id !== selectedId || n.type === "plus_placeholder") return n
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
            `Removed lanes: ${synced.removedLaneLabels.join(", ")}`,
          )
        }
        setEdges(nextEdges)
      } else {
        nextNodes = nodes.map((n) => {
          if (n.id !== selectedId || n.type === "plus_placeholder") return n
          return {
            ...n,
            data: {
              ...n.data,
              config: configToApply,
            },
          } as WfRfNode
        })
      }
      setNodes(nextNodes)
      setPropConfig(configToApply)
      onConfigDraftChange?.(false)
      if (
        workflowId?.trim() &&
        selected?.type === "wfNode" &&
        selected.data.wfType === "video"
      ) {
        void heygenService
          .patchPresenterConfig(workflowId, selectedId, configToApply)
          .catch(() => {
            toast.error(
              "Could not save video settings to the server. Use Save workflow before running.",
            )
          })
      }
    }, [
      edges,
      nodes,
      onConfigDraftChange,
      propConfig,
      readOnly,
      selectedId,
      setEdges,
      setNodes,
      setPropConfig,
      workflowId,
    ])

    const showPalette = !readOnly && !isMaterializedView

    return (
      <DndContext
        sensors={paletteSensors}
        onDragStart={showPalette ? handlePaletteDragStart : undefined}
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
            onInit={onInit}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            isValidConnection={isValidConnection}
            minZoom={0.35}
            maxZoom={1.5}
            defaultViewport={{ x: 0, y: 0, zoom: 1 }}
            className="h-full min-h-0 w-full flex-1 bg-transparent!"
            style={{ width: "100%", height: "100%" }}
          >
            <Background gap={24} size={1} />
            <Controls
              className="border-(--nt-border)! shadow-md!"
              showInteractive={false}
            />
            <MiniMap
              className="rounded-lg! border! border-(--nt-border)! bg-card! shadow-md!"
              maskColor="rgba(247, 244, 239, 0.72)"
              nodeStrokeWidth={2}
              zoomable
              pannable
            />
          </ReactFlow>
          </WorkflowCanvasDropZone>

          {selNode && !readOnly ? (
            <WorkflowPropertiesPanel
              selNode={selNode}
              propConfig={propConfig}
              setPropConfig={setPropConfig}
              resolvedChannels={resolvedChannels}
              workflowId={workflowId}
              onClose={closePanel}
              onApply={applyChanges}
              onReset={() => {
                setPropConfig(selNode.config ?? {})
              }}
            />
          ) : null}

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
