import type { MouseEvent, ReactNode } from "react"
import type { Edge, Node } from "@xyflow/react"
import type { BranchChannelHandle } from "@/features/workflow/lib/branch-channels"
import { formatLaneNodeLabel } from "@/features/workflow/lib/lane-node-label"
import { channelLabel, normalizeChannelId } from "@/shared/constants/distribution-channels"
import i18n from "@/i18n"
import { CHIP_COLORS, type ChipColor } from "@/lib/tokens"
import {
  isPreviewEdgeId,
  persistedLayoutFromApiNodes,
  resolveWorkflowLayout,
} from "@/features/workflow/lib/branch-layout"
import { laneEdgeId } from "@/features/workflow/lib/workflow-lane-layout"
import {
  effectiveVideoMode,
} from "@/features/workflow/lib/video-generation-ui"
import type {
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeType,
} from "@/shared/types/workflow.type"

export const NODE_W = 240
export const NODE_H = 108

type WfNodeTypeVisual = {
  type: string
  color: string
  bg: string
  locked: boolean
  icon: ReactNode
}

const WF_NODE_TYPE_VISUALS: WfNodeTypeVisual[] = [
  {
    type: "keywords",
    color: "#6366F1",
    bg: "#EEF2FF",
    locked: false,
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M4 4h8M4 8h6M4 12h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="11" cy="4" r="1.5" fill="currentColor" />
      </svg>
    ),
  },
  {
    type: "text",
    color: "#00A589",
    bg: "#E0FAF5",
    locked: false,
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M2 4h12M2 7h9M2 10h11M2 13h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    type: "image",
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
    color: "#DC2626",
    bg: "#FEE2E2",
    locked: false,
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M2 4h12M2 7h8M2 10h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    type: "branch",
    color: "#0D9488",
    bg: "#CCFBF1",
    locked: false,
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M8 2v4M8 10v4M8 6h4M8 6H4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    type: "adapt",
    color: "#9333EA",
    bg: "#F3E8FF",
    locked: false,
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M3 8h10M10 5l3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    type: "merge",
    color: "#64748B",
    bg: "#F1F5F9",
    locked: false,
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M4 4v4h8V4M8 8v8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    type: "intelligence",
    color: "#4F46E5",
    bg: "#EEF2FF",
    locked: false,
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.4" />
        <path d="M8 5v3l2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
]

export function getWfNodeTypeLabel(type: string): string {
  return i18n.t(`workflow:nodeTypes.${type}`, { defaultValue: type })
}

export function getWfNodeTypes(): {
  type: string
  label: string
  color: string
  bg: string
  locked: boolean
  icon: ReactNode
}[] {
  return WF_NODE_TYPE_VISUALS.map((meta) => ({
    ...meta,
    label: getWfNodeTypeLabel(meta.type),
  }))
}

export const WF_NODE_TYPES: {
  type: string
  label: string
  color: string
  bg: string
  locked: boolean
  icon: ReactNode
}[] = WF_NODE_TYPE_VISUALS.map((meta) => ({
  ...meta,
  get label() {
    return getWfNodeTypeLabel(meta.type)
  },
}))

// Backend API type ↔ canvas short type
const BACKEND_TO_CANVAS: Record<WorkflowNodeType, string> = {
  keyword_planner: "keywords",
  text_generation: "text",
  image_generation: "image",
  video_generation: "video",
  translation: "translation",
  transcription: "transcription",
  summarization: "summarization",
  branch: "branch",
  adapt: "adapt",
  merge: "merge",
  intelligence: "intelligence",
}

const CANVAS_TO_BACKEND: Record<string, WorkflowNodeType> = {
  keywords: "keyword_planner",
  text: "text_generation",
  image: "image_generation",
  video: "video_generation",
  translation: "translation",
  transcription: "transcription",
  summarization: "summarization",
  branch: "branch",
  adapt: "adapt",
  merge: "merge",
  intelligence: "intelligence",
}

export function backendTypeToCanvas(t: WorkflowNodeType): string {
  return BACKEND_TO_CANVAS[t] ?? "keywords"
}

export function canvasTypeToBackend(t: string): WorkflowNodeType {
  return CANVAS_TO_BACKEND[t] ?? "keyword_planner"
}

export const STATUS_MAP = {
  pending: { bg: "#EDF2F7", text: "#718096", border: "#D9E1EC", dot: "#A0AEC0" },
  idle: { bg: "#EDF2F7", text: "#718096", border: "#D9E1EC", dot: "#A0AEC0" },
  ready: { bg: "#E0FAF5", text: "#00A589", border: "#80E5D1", dot: "#00A589" },
  running: { bg: "#DBEAFE", text: "#2563EB", border: "#93C5FD", dot: "#2563EB" },
  streaming: { bg: "#DBEAFE", text: "#2563EB", border: "#93C5FD", dot: "#2563EB" },
  processing: { bg: "#DBEAFE", text: "#2563EB", border: "#93C5FD", dot: "#2563EB" },
  retrying: { bg: "#FFEDD5", text: "#EA580C", border: "#FDBA74", dot: "#EA580C" },
  done: { bg: "#DCFCE7", text: "#16A34A", border: "#86EFAC", dot: "#16A34A" },
  completed: { bg: "#DCFCE7", text: "#16A34A", border: "#86EFAC", dot: "#16A34A" },
  skipped: { bg: "#EDF2F7", text: "#718096", border: "#D9E1EC", dot: "#A0AEC0" },
  waiting_review: { bg: "#CCFBF1", text: "#0D9488", border: "#5EEAD4", dot: "#0D9488" },
  failed_final: { bg: "#FEE2E2", text: "#DC2626", border: "#FCA5A5", dot: "#DC2626" },
  failed: { bg: "#FEE2E2", text: "#DC2626", border: "#FCA5A5", dot: "#DC2626" },
} as const

export type NodeStatus = keyof typeof STATUS_MAP

export type WfNodeData = {
  label: string
  wfType: string
  status: NodeStatus
  locked: boolean
  config: Record<string, unknown>
  /** Credits charged per run for this node type (from pipeline estimate). */
  creditCost?: number
  previewText?: string
  previewImage?: string
  previewVideo?: string
  processingMessage?: string
  errorMessage?: string
  retryAttempt?: number
  retryMaxAttempts?: number
  lane?: string | null
  channelHandles?: BranchChannelHandle[]
  showChannelPreview?: boolean
  onDelete?: () => void
  onOpenSettings?: () => void
  settingsOpen?: boolean
  onRetry?: () => void
  onSkip?: () => void
  onOpenReview?: () => void
  onSkipReview?: () => void
  reviewText?: string
  onOpenAddPopover?: (event: MouseEvent, nodeId: string) => void
  readOnly?: boolean
} & Record<string, unknown>

export type PlusPlaceholderNodeData = {
  onOpenPopover?: (event: React.MouseEvent) => void
}

export type WfRfNode =
  | Node<WfNodeData, "wfNode">
  | Node<WfNodeData, "branchNode">
  | Node<WfNodeData, "mergeNode">
  | Node<PlusPlaceholderNodeData, "plus_placeholder">

export interface WFNode {
  id: string
  type: string
  label: string
  x: number
  y: number
  status: NodeStatus
  locked: boolean
  config: Record<string, unknown>
}

export const PIPE_GAP = 80

/** Default `config.model` per canvas node type (aligned with server normalizeNodeConfig). */
export const DEFAULT_MODEL_BY_CANVAS_TYPE: Record<string, string> = {
  keywords: "gpt-4o",
  text: "gpt-4o",
  image: "dall-e-3",
  video: "sora-2",
  translation: "gpt-4o",
  transcription: "whisper-1",
  summarization: "gpt-4o",
}

export function defaultConfigForNewCanvasNode(wfType: string): Record<string, unknown> {
  const model = DEFAULT_MODEL_BY_CANVAS_TYPE[wfType] ?? "gpt-4o"
  switch (wfType) {
    case "keywords":
      return { model, temperature: 0.3, maxTokens: 800 }
    case "text":
      return {
        model,
        outputFormat: "paragraph",
        tone: "professional",
        textLength: "medium",
      }
    case "image":
      return {
        model,
        template: "auto",
        designStyle: "auto",
        style: "natural",
        aspectRatio: "1:1",
        quality: "standard",
      }
    case "video":
      return {
        mode: "cinematic",
        model,
        aspectRatio: "16:9",
        resolution: "720p",
        duration: 8,
        heygenOrientation: "landscape",
        heygenExpressiveness: "medium",
        removeBackground: true,
      }
    case "translation":
      return {
        model,
        sourceLanguage: "auto",
        targetLanguage: "th",
        formalityLevel: "casual",
        preserveFormatting: true,
      }
    case "transcription":
      return { model, language: "auto", sourceType: "audio" }
    case "summarization":
      return {
        model,
        summaryLength: "medium",
        outputFormat: "paragraph",
        sourceNodeRef: "text_generation",
      }
    case "branch":
      return { mode: "rule_channels" }
    default:
      return { model }
  }
}

/** Rule fields used to mirror server `defaultConfigForGenerateMore`. */
export type GenerateMoreRuleHint = {
  channels?: { channel?: string }[]
  audience?: { language?: string }
}

/**
 * Defaults for Generate more / re-run config UI — same base as workflow canvas nodes,
 * with optional rule-aware overrides (mirrors server `defaultWorkflowNodeConfigForRule`).
 */
export function buildGenerateMoreDefaultConfig(
  type: WorkflowNodeType,
  rule?: GenerateMoreRuleHint | null,
): Record<string, unknown> {
  const canvas = backendTypeToCanvas(type)
  const base = { ...defaultConfigForNewCanvasNode(canvas) }

  const channels = rule?.channels ?? []
  const hasInstagram = channels.some(
    (c) => (c.channel ?? "").toLowerCase() === "instagram",
  )
  const audienceLang = rule?.audience?.language?.trim()

  if (type === "video_generation" && hasInstagram) {
    base.aspectRatio = "9:16"
  }
  if (
    type === "transcription" &&
    audienceLang &&
    audienceLang.length > 0
  ) {
    base.language = audienceLang
  }

  return base
}

const CONFIG_OPTION_ALIASES: Record<string, string> = {
  auto: "auto",
  en: "english",
  th: "thai",
  ja: "japanese",
  zh: "chinese",
  ko: "korean",
  es: "spanish",
  fr: "french",
  de: "german",
  "720p": "resolution720p",
  landscape: "landscape169",
  portrait: "portrait916",
}

function configString(
  config: Record<string, unknown>,
  key: string,
): string | undefined {
  const raw = config[key]
  if (raw == null || raw === "") return undefined
  return String(raw)
}

function configNumber(
  config: Record<string, unknown>,
  key: string,
): number | undefined {
  const raw = config[key]
  if (typeof raw === "number" && Number.isFinite(raw)) return raw
  if (typeof raw === "string" && raw.trim() !== "") {
    const parsed = Number(raw)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function formatOptionLabel(
  value: string | undefined,
  options?: { sourceLanguage?: boolean },
): string | undefined {
  if (!value) return undefined
  const keys = new Set<string>([value])
  const alias = CONFIG_OPTION_ALIASES[value]
  if (alias) keys.add(alias)
  if (options?.sourceLanguage && value === "auto") keys.add("autoDetect")
  for (const key of keys) {
    const label = i18n.t(`workflow:fields.options.${key}`, { defaultValue: "" })
    if (label) return label
  }
  return value
}

function formatDuration(config: Record<string, unknown>, key = "duration"): string | undefined {
  const seconds = configNumber(config, key)
  if (seconds === undefined) return undefined
  const durationKey = `duration${seconds}s`
  return (
    formatOptionLabel(durationKey) ??
    i18n.t(`workflow:fields.options.${durationKey}`, { defaultValue: `${seconds}s` })
  )
}

function joinConfigParts(parts: Array<string | undefined>): string {
  return parts.filter((part): part is string => Boolean(part)).join(" · ")
}

/** Short read-only hint for canvas cards (reusable “how”, not run content). */
export function canvasConfigSummary(wfType: string, config: Record<string, unknown>): string {
  switch (wfType) {
    case "keywords":
      return (
        joinConfigParts([
          configString(config, "model"),
          configNumber(config, "temperature") !== undefined
            ? i18n.t("workflow:configSummary.temperature", {
                value: configNumber(config, "temperature"),
              })
            : undefined,
          configNumber(config, "maxTokens") !== undefined
            ? i18n.t("workflow:configSummary.maxTokens", {
                value: configNumber(config, "maxTokens"),
              })
            : undefined,
        ]) || i18n.t("workflow:configSummary.keywordPlanner")
      )
    case "text":
      return (
        joinConfigParts([
          formatOptionLabel(configString(config, "tone")),
          formatOptionLabel(configString(config, "textLength")),
          formatOptionLabel(configString(config, "outputFormat")),
        ]) || i18n.t("workflow:configSummary.textSettings")
      )
    case "image":
      return (
        joinConfigParts([
          configString(config, "aspectRatio"),
          formatOptionLabel(configString(config, "style")),
          formatOptionLabel(configString(config, "quality")),
        ]) || i18n.t("workflow:configSummary.imageSettings")
      )
    case "video": {
      const mode = effectiveVideoMode(config)
      if (mode === "presenter") {
        return (
          joinConfigParts([
            formatOptionLabel("presenter"),
            formatDuration(config),
            formatOptionLabel(configString(config, "heygenOrientation")),
            formatOptionLabel(configString(config, "heygenExpressiveness")),
            config.removeBackground === false
              ? i18n.t("workflow:nodeCard.backgroundKept")
              : undefined,
          ]) || i18n.t("workflow:configSummary.videoSettings")
        )
      }
      return (
        joinConfigParts([
          formatOptionLabel("cinematic"),
          formatDuration(config),
          configString(config, "aspectRatio"),
          formatOptionLabel(configString(config, "resolution")),
        ]) || i18n.t("workflow:configSummary.videoSettings")
      )
    }
    case "translation": {
      const source = formatOptionLabel(
        configString(config, "sourceLanguage") ?? "auto",
        { sourceLanguage: true },
      )
      const target = formatOptionLabel(configString(config, "targetLanguage"))
      const route =
        source && target
          ? `${source} → ${target}`
          : target
            ? `→ ${target}`
            : undefined
      return (
        joinConfigParts([
          route,
          formatOptionLabel(configString(config, "formalityLevel")),
          config.preserveFormatting === false
            ? i18n.t("workflow:nodeCard.reflowOk")
            : undefined,
        ]) || i18n.t("workflow:configSummary.translation")
      )
    }
    case "summarization":
      return (
        joinConfigParts([
          formatOptionLabel(configString(config, "summaryLength")),
          formatOptionLabel(configString(config, "outputFormat")),
        ]) || i18n.t("workflow:configSummary.summary")
      )
    case "transcription":
      return (
        joinConfigParts([
          formatOptionLabel(configString(config, "language")),
          configString(config, "sourceType"),
        ]) || i18n.t("workflow:configSummary.transcription")
      )
    case "branch": {
      const mode = configString(config, "mode") ?? "rule_channels"
      if (mode === "rule_channels") {
        return i18n.t("workflow:configSummary.fromCampaignRule")
      }
      return formatOptionLabel(mode) ?? i18n.t("workflow:configSummary.fromCampaignRule")
    }
    case "adapt":
      return configString(config, "channel")
        ? i18n.t("workflow:configSummary.channel", {
            channel: configString(config, "channel"),
          })
        : i18n.t("workflow:configSummary.channelAdapt")
    case "merge":
      return i18n.t("workflow:configSummary.fanInBarrier")
    case "intelligence": {
      const searchType = configString(config, "searchType")
      const typeLabel = searchType
        ? i18n.t(`workflow:configSummary.intelligenceTypes.${searchType}`, {
            defaultValue: formatOptionLabel(searchType) ?? searchType,
          })
        : i18n.t("workflow:configSummary.intelligenceTypes.all")
      return joinConfigParts([typeLabel, configString(config, "model")])
    }
    default:
      return i18n.t("workflow:configSummary.configured")
  }
}

export const INITIAL_NODES: WFNode[] = [
  {
    id: "n1",
    type: "text",
    label: getWfNodeTypeLabel("text"),
    x: 80,
    y: 140,
    status: "ready",
    locked: false,
    config: { model: "gpt-4o", outputFormat: "paragraph", tone: "professional", textLength: "medium" },
  },
  {
    id: "n2",
    type: "image",
    label: getWfNodeTypeLabel("image"),
    x: 80 + NODE_W + PIPE_GAP,
    y: 140,
    status: "idle",
    locked: false,
    config: {
      model: "dall-e-3",
      style: "natural",
      aspectRatio: "4:5",
    },
  },
  {
    id: "n3",
    type: "translation",
    label: getWfNodeTypeLabel("translation"),
    x: 80 + (NODE_W + PIPE_GAP) * 2,
    y: 140,
    status: "idle",
    locked: false,
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

const STATUS_CHIP: Record<NodeStatus, ChipColor> = {
  pending: "gray",
  idle: "gray",
  ready: "green",
  running: "blue",
  streaming: "blue",
  processing: "blue",
  retrying: "amber",
  done: "green",
  completed: "green",
  skipped: "gray",
  waiting_review: "indigo",
  failed_final: "red",
  failed: "red",
}

export function statusStyle(status: NodeStatus) {
  const chip = CHIP_COLORS[STATUS_CHIP[status] ?? "gray"]
  return {
    bg: chip.bg,
    text: chip.text,
    border: chip.border,
    dot: chip.text,
    label: i18n.t(`workflow:nodeStatus.${status}`, { defaultValue: status }),
  }
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
      config: n.config,
    },
    draggable: !n.locked,
  }
}

export function rfNodeToWfNode(
  n: Node<WfNodeData, "wfNode" | "branchNode" | "mergeNode">,
): WFNode {
  const d = n.data
  return {
    id: n.id,
    type: d.wfType,
    label: d.label,
    x: n.position.x,
    y: n.position.y,
    status: d.status,
    locked: d.locked,
    config: d.config ?? {},
  }
}

export function connectionsToEdges(connections = CONNECTIONS): Edge[] {
  return connections.map((c) => ({
    id: `e-${c.from}-${c.to}`,
    source: c.from,
    target: c.to,
    type: "plus_edge",
    animated: true,
    style: { stroke: "#00A589", strokeWidth: 2 },
  }))
}

function apiEdgesToRf(
  apiNodes: WorkflowNode[],
  apiEdges?: WorkflowEdge[],
): Edge[] {
  if (apiEdges && apiEdges.length > 0) {
    return apiEdges.map((e) => ({
      id: laneEdgeId(e.from, e.to, {
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
      }),
      source: e.from,
      target: e.to,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      type: "plus_edge",
      animated: true,
      style: { stroke: "#00A589", strokeWidth: 2 },
    }))
  }
  const sorted = [...apiNodes].sort((a, b) => a.order - b.order)
  return sorted.slice(0, -1).map((_, i) => ({
    id: `e-${sorted[i].nodeId}-${sorted[i + 1].nodeId}`,
    source: sorted[i].nodeId,
    target: sorted[i + 1].nodeId,
    type: "plus_edge",
    animated: true,
    style: { stroke: "#00A589", strokeWidth: 2 },
  }))
}

export type ApiNodesToRfOptions = {
  channelHandles?: BranchChannelHandle[]
  /** When true, skip layout (caller runs resolveWorkflowLayout after graph mutations). */
  skipLayout?: boolean
}

export function rfNodeTypeForCanvas(
  canvasType: string,
): "wfNode" | "branchNode" | "mergeNode" {
  if (canvasType === "branch") return "branchNode"
  if (canvasType === "merge") return "mergeNode"
  return "wfNode"
}

/** Convert API WorkflowNode[] → RF nodes + edges (positioned horizontally by order). */
export function apiNodesToRf(
  apiNodes: WorkflowNode[],
  apiEdges?: WorkflowEdge[],
  options?: ApiNodesToRfOptions,
): {
  nodes: WfRfNode[]
  edges: Edge[]
} {
  const sorted = [...apiNodes].sort((a, b) => a.order - b.order)
  const channelHandles = options?.channelHandles ?? []
  const rfNodes: WfRfNode[] = sorted.map((n) => {
    const canvasType = backendTypeToCanvas(n.type)
    const meta = WF_NODE_TYPES.find((t) => t.type === canvasType) ?? WF_NODE_TYPES[0]
    const rfType = rfNodeTypeForCanvas(canvasType)
    const branchMergeData =
      rfType === "branchNode" || rfType === "mergeNode"
        ? { channelHandles }
        : {}
    const config = (n.config ?? {}) as Record<string, unknown>
    const laneFromConfig =
      typeof config.laneId === "string" ? config.laneId.trim() : ""
    const laneFromApi =
      typeof n.lane === "string" && n.lane.trim() ? n.lane.trim() : ""
    const effectiveLaneKey = laneFromApi || laneFromConfig
      ? normalizeChannelId(laneFromApi || laneFromConfig)
      : ""
    const channelDisplay =
      effectiveLaneKey && channelHandles.length > 0
        ? (channelHandles.find((ch) => ch.id === effectiveLaneKey)?.label ??
          channelLabel(effectiveLaneKey))
        : effectiveLaneKey
          ? channelLabel(effectiveLaneKey)
          : null
    const hasPosition =
      typeof n.x === "number" &&
      Number.isFinite(n.x) &&
      typeof n.y === "number" &&
      Number.isFinite(n.y)
    return {
      id: n.nodeId,
      type: rfType,
      position: hasPosition ? { x: n.x!, y: n.y! } : { x: 80, y: 140 },
      data: {
        label: channelDisplay
          ? formatLaneNodeLabel(canvasType, channelDisplay)
          : meta.label,
        wfType: canvasType,
        status: "idle" as NodeStatus,
        locked: false,
        config,
        lane: effectiveLaneKey || null,
        ...branchMergeData,
      },
      draggable: true,
    }
  })

  const edges = apiEdgesToRf(sorted, apiEdges)
  if (options?.skipLayout) {
    return { nodes: rfNodes, edges }
  }
  return resolveWorkflowLayout(
    rfNodes,
    edges,
    channelHandles,
    persistedLayoutFromApiNodes(apiNodes),
  )
}

/** Convert current RF nodes → backend save payload (strips all DB fields). */
export function rfNodesToApiPayload(
  rfNodes: WfRfNode[],
  edges: Edge[],
): {
  nodes: Array<{
    nodeId: string
    type: WorkflowNodeType
    order: number
    isLocked: boolean
    config: Record<string, unknown>
    x: number
    y: number
    lane?: string
  }>
  edges: WorkflowEdge[]
} {
  const persistableNodes = rfNodes.filter((n) => n.type !== "plus_placeholder")
  const orderedNodeIds = deriveNodeOrder(persistableNodes, edges)
  const orderLookup = new Map(orderedNodeIds.map((id, index) => [id, index + 1]))
  const nodeIdSet = new Set(persistableNodes.map((n) => n.id))
  const nodes = persistableNodes.map((n, i) => {
    const lane = n.data.lane?.trim()
    const config = { ...(n.data.config ?? {}) }
    if (lane && !config.laneId) {
      config.laneId = lane
    }
    return {
      nodeId: n.id,
      type: canvasTypeToBackend(n.data.wfType),
      order: orderLookup.get(n.id) ?? i + 1,
      isLocked: false,
      config,
      x: n.position.x,
      y: n.position.y,
      lane: lane ?? undefined,
    }
  })
  const workflowEdges: WorkflowEdge[] = edges
    .filter((e) => !isPreviewEdgeId(e.id))
    .filter(
      (e) =>
        e.source &&
        e.target &&
        nodeIdSet.has(e.source) &&
        nodeIdSet.has(e.target),
    )
    .map((e) => ({
      from: e.source,
      to: e.target,
      ...(e.sourceHandle ? { sourceHandle: e.sourceHandle } : {}),
      ...(e.targetHandle ? { targetHandle: e.targetHandle } : {}),
    }))
  return { nodes, edges: workflowEdges }
}

function deriveNodeOrder(rfNodes: WfRfNode[], edges: Edge[]): string[] {
  if (rfNodes.length <= 1) return rfNodes.map((node) => node.id)

  const nodeIds = rfNodes.map((n) => n.id)
  const nodesById = new Map(rfNodes.map((node) => [node.id, node]))
  const edgeIncidentIds = new Set<string>()
  for (const edge of edges) {
    if (nodesById.has(edge.source)) edgeIncidentIds.add(edge.source)
    if (nodesById.has(edge.target)) edgeIncidentIds.add(edge.target)
  }

  const connectedIds = nodeIds.filter((id) => edgeIncidentIds.has(id))
  const disconnectedNodes = rfNodes.filter((node) => !edgeIncidentIds.has(node.id))

  const sortByPosition = (a: WfRfNode, b: WfRfNode) =>
    a.position.x === b.position.x
      ? a.position.y - b.position.y
      : a.position.x - b.position.x

  if (connectedIds.length === 0) {
    return [...rfNodes].sort(sortByPosition).map((node) => node.id)
  }

  const indegree = new Map<string, number>(connectedIds.map((id) => [id, 0]))
  const outgoing = new Map<string, string[]>(connectedIds.map((id) => [id, []]))

  for (const edge of edges) {
    if (!nodesById.has(edge.source) || !nodesById.has(edge.target)) continue
    if (!indegree.has(edge.source) || !indegree.has(edge.target)) continue
    outgoing.get(edge.source)!.push(edge.target)
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1)
  }

  const queue = connectedIds.filter((id) => (indegree.get(id) ?? 0) === 0)

  const ordered: string[] = []
  while (queue.length > 0) {
    const current = queue.shift()!
    ordered.push(current)
    const nexts = outgoing.get(current) ?? []
    for (const next of nexts) {
      const deg = (indegree.get(next) ?? 0) - 1
      indegree.set(next, deg)
      if (deg === 0) {
        queue.push(next)
      }
    }
  }

  const remainder = connectedIds.filter((id) => !ordered.includes(id))
  const disconnected = [...disconnectedNodes]
    .sort(sortByPosition)
    .map((node) => node.id)

  return [...ordered, ...remainder, ...disconnected]
}
