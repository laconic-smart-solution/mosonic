import "@xyflow/react/dist/style.css"

import type { DragEvent } from "react"
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
  type OnSelectionChangeParams,
  type ReactFlowInstance,
} from "@xyflow/react"

import {
  WF_NODE_TYPES,
  apiNodesToRf,
  defaultConfigForNewCanvasNode,
  rfNodeToWfNode,
  type WfRfNode,
} from "@/features/workflow/data/workflow-model"

import type { WorkflowNode } from "@/shared/types/workflow.type"
import { WorkflowPropertiesPanel } from "./workflow-properties-panel"
import { WorkflowRfNode } from "./workflow-rf-node"

const nodeTypes = { wfNode: WorkflowRfNode }

function linearConnectionAllowed(item: Edge | Connection, edges: Edge[]): boolean {
  const source = item.source
  const target = item.target
  if (!source || !target || source === target) return false
  if (edges.some((e) => e.source === source)) return false
  if (edges.some((e) => e.target === target)) return false
  return true
}

export type WorkflowFlowCanvasHandle = {
  getRfNodes: () => WfRfNode[]
  getRfEdges: () => Edge[]
}

type WorkflowFlowCanvasProps = {
  apiNodes?: WorkflowNode[]
  readOnly?: boolean
  runtimeById?: Record<string, Record<string, unknown>>
  onRetryNode?: (nodeId: string) => void
}

export const WorkflowFlowCanvas = forwardRef<WorkflowFlowCanvasHandle, WorkflowFlowCanvasProps>(
  function WorkflowFlowCanvas({ apiNodes, readOnly = false, runtimeById = {}, onRetryNode }, ref) {
    const initialNodes = useMemo(() => [] as WfRfNode[], [])
    const initialEdges = useMemo(() => [] as Edge[], [])

    const [nodes, setNodes, onNodesChange] = useNodesState<WfRfNode>(initialNodes)
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [propConfig, setPropConfig] = useState<Record<string, unknown>>({})

    const rf = useRef<ReactFlowInstance<WfRfNode> | null>(null)

    // Populate canvas when apiNodes arrive
    useEffect(() => {
      if (!apiNodes || apiNodes.length === 0) return
      const { nodes: rfNodes, edges: rfEdges } = apiNodesToRf(apiNodes)
      setNodes(rfNodes)
      setEdges(rfEdges)
      setSelectedId(null)
      setPropConfig({})
      // Fit view after React Flow renders the new nodes
      queueMicrotask(() => void rf.current?.fitView({ padding: 0.15 }))
    }, [apiNodes, setNodes, setEdges])

    useImperativeHandle(ref, () => ({
      getRfNodes: () => nodes,
      getRfEdges: () => edges,
    }))

    const isValidConnection = useCallback(
      (item: Edge | Connection) => linearConnectionAllowed(item, edges),
      [edges],
    )

    const onConnect = useCallback(
      (params: Connection) => {
        if (readOnly) return
        setEdges((eds) =>
          addEdge(
            {
              ...params,
              id: `e-${params.source}-${params.target}`,
              type: "smoothstep",
              animated: true,
              style: { stroke: "#00A589", strokeWidth: 2 },
            },
            eds,
          ),
        )
      },
      [readOnly, setEdges],
    )

    const onSelectionChange = useCallback((p: OnSelectionChangeParams<WfRfNode>) => {
      const n = p.nodes[0]
      setSelectedId(n?.id ?? null)
      setPropConfig((n?.data.config as Record<string, unknown>) ?? {})
    }, [])

    const selNode = useMemo(() => {
      const n = nodes.find((x) => x.id === selectedId)
      return n ? rfNodeToWfNode(n) : null
    }, [nodes, selectedId])

    const onDrop = useCallback(
      (e: DragEvent) => {
        if (readOnly) return
        e.preventDefault()
        if (!rf.current) return
        const raw = e.dataTransfer.getData("application/reactflow")
        if (!raw) return
        let wfType: string
        try {
          wfType = (JSON.parse(raw) as { wfType: string }).wfType
        } catch {
          return
        }
        const meta = WF_NODE_TYPES.find((t) => t.type === wfType)
        if (!meta) return
        const position = rf.current.screenToFlowPosition({
          x: e.clientX,
          y: e.clientY,
        })
        const id = `n-${crypto.randomUUID()}`
        const newNode: WfRfNode = {
          id,
          type: "wfNode",
          position,
          data: {
            label: meta.label,
            wfType,
            status: "idle",
            locked: meta.locked,
            config: defaultConfigForNewCanvasNode(wfType),
          },
          draggable: !meta.locked,
        }
        setNodes((nds) => {
          if (wfType === "keywords" && nds.some((n) => n.data.wfType === "keywords")) {
            return nds
          }
          if (wfType === "text" && nds.some((n) => n.data.wfType === "text")) {
            return nds
          }
          return [...nds, newNode]
        })
      },
      [readOnly, setNodes],
    )

    const onDragOver = useCallback((e: DragEvent) => {
      if (readOnly) return
      e.preventDefault()
      e.dataTransfer.dropEffect = "move"
    }, [readOnly])

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
        const nonDeletable =
          node?.data.wfType === "text" || node?.data.wfType === "keywords"
        if (!node || nonDeletable) return
        setNodes((nds) => nds.filter((entry) => entry.id !== nodeId))
        setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId))
        if (selectedId === nodeId) closePanel()
      },
      [readOnly, nodes, selectedId, closePanel, setEdges, setNodes],
    )

    useEffect(() => {
      if (!selectedId) return
      const handler = (event: KeyboardEvent) => {
        if (event.key !== "Delete" && event.key !== "Backspace") return
        const target = event.target as HTMLElement | null
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
          return
        }
        deleteNode(selectedId)
      }
      window.addEventListener("keydown", handler)
      return () => window.removeEventListener("keydown", handler)
    }, [selectedId, deleteNode])

    const nodesWithActions = useMemo(
      () =>
        nodes.map((node) => ({
          ...node,
          data: {
            ...node.data,
            ...runtimeById[node.id],
            onDelete: readOnly ? undefined : () => deleteNode(node.id),
            onRetry: onRetryNode ? () => onRetryNode(node.id) : undefined,
          },
        })),
      [deleteNode, nodes, onRetryNode, readOnly, runtimeById],
    )

    const applyChanges = useCallback(() => {
      if (readOnly) return
      if (!selectedId) return
      setNodes((nds) =>
        nds.map((n) =>
          n.id === selectedId
            ? {
                ...n,
                data: {
                  ...n.data,
                  config: propConfig,
                },
              }
            : n,
        ),
      )
    }, [readOnly, selectedId, propConfig, setNodes])

    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-row overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <ReactFlow<WfRfNode>
            nodes={nodesWithActions}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={readOnly ? undefined : onConnect}
            onSelectionChange={onSelectionChange}
            onDrop={readOnly ? undefined : onDrop}
            onDragOver={readOnly ? undefined : onDragOver}
            onInit={onInit}
            nodeTypes={nodeTypes}
            isValidConnection={isValidConnection}
            minZoom={0.35}
            maxZoom={1.5}
            defaultViewport={{ x: 0, y: 0, zoom: 1 }}
            className="h-full min-h-0 w-full flex-1 bg-transparent!"
            style={{ width: "100%", height: "100%" }}
          >
            <Background gap={24} size={1} />
            <Controls className="border-(--nt-border)! shadow-md!" showInteractive={false} />
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
            onClose={closePanel}
            onApply={applyChanges}
            onReset={() => {
              setPropConfig(selNode.config ?? {})
            }}
          />
        ) : null}
      </div>
    )
  },
)
