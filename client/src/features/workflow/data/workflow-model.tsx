import type { ReactNode } from "react"
import type { Edge, Node } from "@xyflow/react"
import type { WorkflowNode, WorkflowNodeType } from "@/shared/types/workflow.type"

export const NODE_W = 240
export const NODE_H = 108

export const WF_NODE_TYPES: {
  type: string
  label: string
  color: string
  bg: string
  locked: boolean
  icon: ReactNode
}[] = [
  {
    type: "text",
    label: "Text Generation",
    color: "#00A589",
    bg: "#E0FAF5",
    locked: true,
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M2 4h12M2 7h9M2 10h11M2 13h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    type: "image",
    label: "Image Generation",
    color: "#254C94",
    bg: "#E8EDF6",
    locked: false,
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="6" cy="6" r="1.5" fill="currentColor" opacity="0.6" />
        <path d="M2 11l3-3 3 3 2-2 4 4" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    type: "video",
    label: "Video Generation",
    color: "#06B6D4",
    bg: "#ECFEFF",
    locked: false,
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <rect x="1" y="3" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.4" />
        <path d="M11 6l4-2v6l-4-2V6z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    type: "translation",
    label: "Translation",
    color: "#D97706",
    bg: "#FFFBEB",
    locked: false,
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M2 4h6M5 2v2M3 4c.5 2 2 3.5 4 4M5 4c-.5 2-2 3.5-3.5 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        <path d="M8 10h6M11 8l2 4-2 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8 14h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    type: "transcription",
    label: "Transcription",
    color: "#7C3AED",
    bg: "#EDE9FE",
    locked: false,
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <rect x="4" y="2" width="8" height="10" rx="2" stroke="currentColor" strokeWidth="1.4" />
        <path d="M2 8a6 6 0 0 0 12 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <line x1="8" y1="14" x2="8" y2="16" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    type: "summarization",
    label: "Summarization",
    color: "#DC2626",
    bg: "#FEE2E2",
    locked: false,
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M2 4h12M2 7h8M2 10h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
]

// Backend API type ↔ canvas short type
const BACKEND_TO_CANVAS: Record<WorkflowNodeType, string> = {
  text_generation: "text",
  image_generation: "image",
  video_generation: "video",
  translation: "translation",
  transcription: "transcription",
  summarization: "summarization",
}

const CANVAS_TO_BACKEND: Record<string, WorkflowNodeType> = {
  text: "text_generation",
  image: "image_generation",
  video: "video_generation",
  translation: "translation",
  transcription: "transcription",
  summarization: "summarization",
}

export function backendTypeToCanvas(t: WorkflowNodeType): string {
  return BACKEND_TO_CANVAS[t] ?? "text"
}

export function canvasTypeToBackend(t: string): WorkflowNodeType {
  return CANVAS_TO_BACKEND[t] ?? "text_generation"
}

export const STATUS_MAP = {
  pending: { label: "Pending", bg: "#EDF2F7", text: "#718096", border: "#D9E1EC", dot: "#A0AEC0" },
  idle: { label: "Idle", bg: "#EDF2F7", text: "#718096", border: "#D9E1EC", dot: "#A0AEC0" },
  ready: { label: "Ready", bg: "#E0FAF5", text: "#00A589", border: "#80E5D1", dot: "#00A589" },
  running: { label: "Running", bg: "#DBEAFE", text: "#2563EB", border: "#93C5FD", dot: "#2563EB" },
  streaming: { label: "Streaming", bg: "#DBEAFE", text: "#2563EB", border: "#93C5FD", dot: "#2563EB" },
  processing: { label: "Processing", bg: "#DBEAFE", text: "#2563EB", border: "#93C5FD", dot: "#2563EB" },
  retrying: { label: "Retrying", bg: "#FFEDD5", text: "#EA580C", border: "#FDBA74", dot: "#EA580C" },
  done: { label: "Done", bg: "#DCFCE7", text: "#16A34A", border: "#86EFAC", dot: "#16A34A" },
  completed: { label: "Completed", bg: "#DCFCE7", text: "#16A34A", border: "#86EFAC", dot: "#16A34A" },
  failed_final: { label: "Failed", bg: "#FEE2E2", text: "#DC2626", border: "#FCA5A5", dot: "#DC2626" },
  failed: { label: "Failed", bg: "#FEE2E2", text: "#DC2626", border: "#FCA5A5", dot: "#DC2626" },
} as const

export type NodeStatus = keyof typeof STATUS_MAP

export type WfNodeData = {
  label: string
  wfType: string
  status: NodeStatus
  locked: boolean
  prompt: string
  config: Record<string, unknown>
  previewText?: string
  previewImage?: string
  previewVideo?: string
  processingMessage?: string
  errorMessage?: string
  retryAttempt?: number
  retryMaxAttempts?: number
  onDelete?: () => void
  onRetry?: () => void
} & Record<string, unknown>

export type WfRfNode = Node<WfNodeData, "wfNode">

export interface WFNode {
  id: string
  type: string
  label: string
  x: number
  y: number
  status: NodeStatus
  locked: boolean
  prompt: string
  config: Record<string, unknown>
}

export const PIPE_GAP = 80

/** Default `config.model` per canvas node type (aligned with server normalizeNodeConfig). */
export const DEFAULT_MODEL_BY_CANVAS_TYPE: Record<string, string> = {
  text: "gpt-4o",
  image: "dall-e-3",
  video: "sora-2",
  translation: "gpt-4o",
  transcription: "whisper-1",
  summarization: "gpt-4o",
}

export function defaultConfigForNewCanvasNode(wfType: string): Record<string, unknown> {
  const model = DEFAULT_MODEL_BY_CANVAS_TYPE[wfType] ?? "gpt-4o"
  return { model }
}

export const INITIAL_NODES: WFNode[] = [
  {
    id: "n1",
    type: "text",
    label: "Text Generation",
    x: 80,
    y: 140,
    status: "ready",
    locked: true,
    prompt:
      "Write a Songkran festival promotional post for Facebook and Instagram, warm festive tone, Thai audience 18–35.",
    config: { model: "gpt-4o", outputFormat: "paragraph" },
  },
  {
    id: "n2",
    type: "image",
    label: "Image Generation",
    x: 80 + NODE_W + PIPE_GAP,
    y: 140,
    status: "idle",
    locked: false,
    prompt: "Generate a festive Songkran water splash banner, warm golden palette, Thai motifs, 4:5 ratio.",
    config: {
      model: "dall-e-3",
      style: "natural",
      aspectRatio: "4:5",
    },
  },
  {
    id: "n3",
    type: "translation",
    label: "Translation",
    x: 80 + (NODE_W + PIPE_GAP) * 2,
    y: 140,
    status: "idle",
    locked: false,
    prompt: "",
    config: {
      model: "gpt-4o",
      targetLanguage: "th",
      formalityLevel: "formal",
    },
  },
]

export const CONNECTIONS: { from: string; to: string }[] = [
  { from: "n1", to: "n2" },
  { from: "n2", to: "n3" },
]

export function statusStyle(status: NodeStatus) {
  return STATUS_MAP[status] ?? STATUS_MAP.idle
}

export function wfNodeToRfNode(n: WFNode): WfRfNode {
  return {
    id: n.id,
    type: "wfNode",
    position: { x: n.x, y: n.y },
    data: {
      label: n.label,
      wfType: n.type,
      status: n.status,
      locked: n.locked,
      prompt: n.prompt,
      config: n.config,
    },
    draggable: !n.locked,
  }
}

export function rfNodeToWfNode(n: WfRfNode): WFNode {
  const d = n.data
  return {
    id: n.id,
    type: d.wfType,
    label: d.label,
    x: n.position.x,
    y: n.position.y,
    status: d.status,
    locked: d.locked,
    prompt: d.prompt,
    config: d.config ?? {},
  }
}

export function connectionsToEdges(connections = CONNECTIONS): Edge[] {
  return connections.map((c) => ({
    id: `e-${c.from}-${c.to}`,
    source: c.from,
    target: c.to,
    type: "smoothstep",
    animated: true,
    style: { stroke: "#00A589", strokeWidth: 2 },
  }))
}

/** Convert API WorkflowNode[] → RF nodes + edges (positioned horizontally by order). */
export function apiNodesToRf(apiNodes: WorkflowNode[]): {
  nodes: WfRfNode[]
  edges: Edge[]
} {
  const sorted = [...apiNodes].sort((a, b) => a.order - b.order)
  const rfNodes = sorted.map((n, i) => {
    const canvasType = backendTypeToCanvas(n.type)
    const meta = WF_NODE_TYPES.find((t) => t.type === canvasType) ?? WF_NODE_TYPES[0]
    return {
      id: n.nodeId,
      type: "wfNode" as const,
      position: { x: 80 + i * (NODE_W + PIPE_GAP), y: 140 },
      data: {
        label: meta.label,
        wfType: canvasType,
        status: "idle" as NodeStatus,
        locked: n.isLocked,
        prompt: n.userPrompt ?? "",
        config: n.config ?? {},
      },
      draggable: !n.isLocked,
    }
  })

  const edges: Edge[] = sorted.slice(0, -1).map((_, i) => ({
    id: `e-${sorted[i].nodeId}-${sorted[i + 1].nodeId}`,
    source: sorted[i].nodeId,
    target: sorted[i + 1].nodeId,
    type: "smoothstep",
    animated: true,
    style: { stroke: "#00A589", strokeWidth: 2 },
  }))

  return { nodes: rfNodes, edges }
}

/** Convert current RF nodes → backend save payload (strips all DB fields). */
export function rfNodesToApiPayload(
  rfNodes: WfRfNode[],
  edges: Edge[],
): { type: WorkflowNodeType; order: number; isLocked: boolean; userPrompt: string; config: Record<string, unknown> }[] {
  const orderedNodeIds = deriveNodeOrder(rfNodes, edges)
  const orderLookup = new Map(orderedNodeIds.map((id, index) => [id, index + 1]))
  return rfNodes.map((n, i) => ({
    type: canvasTypeToBackend(n.data.wfType),
    order: orderLookup.get(n.id) ?? i + 1,
    isLocked: n.data.locked,
    userPrompt: n.data.prompt,
    config: n.data.config ?? {},
  }))
}

function deriveNodeOrder(rfNodes: WfRfNode[], edges: Edge[]): string[] {
  if (rfNodes.length <= 1) return rfNodes.map((node) => node.id)

  const nodesById = new Map(rfNodes.map((node) => [node.id, node]))
  const outgoing = new Map<string, string>()
  const indegree = new Map<string, number>(rfNodes.map((node) => [node.id, 0]))

  for (const edge of edges) {
    if (!nodesById.has(edge.source) || !nodesById.has(edge.target)) continue
    outgoing.set(edge.source, edge.target)
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1)
  }

  const lockedRoot = rfNodes.find((node) => node.data.locked && node.data.wfType === "text")
  const naturalRoot = rfNodes.find((node) => (indegree.get(node.id) ?? 0) === 0)
  let cursor = lockedRoot?.id ?? naturalRoot?.id

  const ordered: string[] = []
  const seen = new Set<string>()

  while (cursor && !seen.has(cursor)) {
    ordered.push(cursor)
    seen.add(cursor)
    cursor = outgoing.get(cursor)
  }

  if (ordered.length === rfNodes.length) return ordered

  const remainder = rfNodes
    .filter((node) => !seen.has(node.id))
    .sort((a, b) => (a.position.x === b.position.x ? a.position.y - b.position.y : a.position.x - b.position.x))
    .map((node) => node.id)

  return [...ordered, ...remainder]
}
