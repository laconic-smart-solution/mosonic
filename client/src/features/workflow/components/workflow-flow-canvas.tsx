import "@xyflow/react/dist/style.css"

import type { MouseEvent } from "react"
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
  type BranchNodeConfig,
} from "@/features/workflow/lib/branch-channels"
import {
  addNodeAfter,
  buildPlusEdge,
  deleteBranchCascade,
  insertNodeBetween,
  PLACEHOLDER_NODE_ID,
  repairOrphanLaneAdapts,
  replaceInitialPlaceholder,
} from "@/features/workflow/lib/workflow-canvas-mutations"
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
import { toast } from "sonner"
import { NodeSelectPopover } from "./node-select-popover"
import { PlusEdge } from "./plus-edge"
import { PlusPlaceholderNode } from "./plus-placeholder-node"
import { WorkflowBranchNode } from "./workflow-branch-node"
import { WorkflowMergeNode } from "./workflow-merge-node"
import { WorkflowPropertiesPanel } from "./workflow-properties-panel"
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
  onBranchConfigApplied?: (config: BranchNodeConfig) => void
  /** Fired when nodes/edges change in edit mode (not selection-only). */
  onCanvasEdited?: () => void
  onConfigDraftChange?: (hasUnappliedChanges: boolean) => void
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
      onBranchConfigApplied,
      onCanvasEdited,
      onConfigDraftChange,
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

    const rf = useRef<ReactFlowInstance<WfRfNode> | null>(null)
    const nodesRef = useRef(nodes)
    const edgesRef = useRef(edges)
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

    useEffect(() => {
      if (rfNodesOverride && rfNodesOverride.length > 0) {
        setNodes(rfNodesOverride)
        setEdges(rfEdgesOverride ?? [])
        setSelectedId(null)
        setPropConfig({})
        setPopover(null)
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
      setNodes(laidOut.nodes)
      setEdges(laidOut.edges)
      setSelectedId(null)
      setPropConfig({})
      setPopover(null)
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
    }, [branchChannels, isMaterializedView, setNodes])

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
      }),
      [branchChannels, setEdges, setNodes],
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

    const closePanel = useCallback(() => {
      setNodes((nds) => nds.map((n) => ({ ...n, selected: false })))
      setSelectedId(null)
      setPropConfig({})
    }, [setNodes])

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
      if (selected?.data.wfType === "branch") {
        onBranchConfigApplied?.(propConfig as BranchNodeConfig)
      }
      let configToApply: Record<string, unknown> = propConfig
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
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== selectedId || n.type === "plus_placeholder") return n
          return {
            ...n,
            data: {
              ...n.data,
              config: configToApply,
            },
          } as WfRfNode
        }),
      )
      if (selected?.data.wfType !== "branch") {
        setPropConfig(configToApply)
      }
    }, [
      nodes,
      onBranchConfigApplied,
      propConfig,
      readOnly,
      selectedId,
      setNodes,
      setPropConfig,
    ])

    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-row overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
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
              className="rounded-lg! border! border-(--nt-border)! bg-white! shadow-md!"
              maskColor="rgba(247, 244, 239, 0.72)"
              nodeStrokeWidth={2}
              zoomable
              pannable
            />
          </ReactFlow>
        </div>

        {selNode && !readOnly ? (
          <WorkflowPropertiesPanel
            selNode={selNode}
            propConfig={propConfig}
            setPropConfig={setPropConfig}
            resolvedChannels={resolvedChannels}
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
    )
  },
)
