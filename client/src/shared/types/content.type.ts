import type { WorkflowNodeType } from "./workflow.type"

export type ContentStatus = "draft" | "in_review" | "approved" | "rejected"

export type ContentApprovalStep = {
  role: string
  required: boolean
}

export type ContentApprovalRecord = {
  stepIndex: number
  userId: string
  at: string
  comment?: string | null
}

export type ContentApprovalState = {
  steps: ContentApprovalStep[]
  currentStepIndex: number
  records: ContentApprovalRecord[]
}

export type ContentPageQueryPayload = {
  page?: number
  limit?: number
  search?: string
  filter?: {
    workflowRef?: string
    ruleRef?: string
    pipelineRef?: string
    status?: ContentStatus
    hasImage?: boolean
    hasVideo?: boolean
    hasSummary?: boolean
  }
  sortBy?: "createdAt" | "updatedAt"
  sortOrder?: "asc" | "desc"
}

export type ContentPageItem = {
  contentId: string
  pipelineRef: string
  workflowRef: string
  ruleRef: string
  status: ContentStatus
  variantId?: string | null
  createdAt: string
  updatedAt: string
  /** Merged userEdits over outputs (matches content detail). */
  outputs?: ContentOutputs
  /** Per-channel adapt outputs (multi-lane runs). */
  laneOutputs?: Record<string, Record<string, unknown>>
  uploadId?: string
  /** Net credits charged for this content (pipeline + reruns). */
  creditsUsed?: number
}

export type ContentPageResponse = {
  data: ContentPageItem[]
  meta: {
    total: number
    page: number
    limit: number
    totalPages: number
  }
}

export type ContentStatsResponse = {
  total: number
  byStatus: Partial<Record<ContentStatus, number>>
}

export type ContentSectionKind =
  | 'heading'
  | 'paragraph'
  | 'bullet_list'
  | 'numbered_list'
  | 'call_to_action'
  | 'hashtags'
  | 'quote'
  | 'rich_text'
  | 'link'
  | 'image_direction'
  | 'video_scene'
  | 'script_segment'
  | 'custom'

export type ContentSectionItem = {
  key: string
  title: string
  kind: ContentSectionKind
  content?: string
  items?: string[]
  level?: number
  metadata?: Record<string, unknown>
}

export type ContentOutputs = {
  keywords?: string
  text?: string
  translatedText?: string
  transcription?: string
  summary?: string
  image?: string
  video?: string
  sections?: ContentSectionItem[]
}

export type ContentDraftNodeView = {
  nodeId: string
  type: string
  lane: string | null
  field: string
  preview: string
  pending: boolean
}

export type ContentDetail = {
  contentId: string
  /** Merged userEdits over outputs. */
  outputs?: ContentOutputs
  nodeOutputs?: Record<string, Record<string, unknown>>
  nodeUserEdits?: Record<string, Record<string, unknown>>
  /** Channel lanes for per-channel preview (chat card / review). */
  lanes?: string[]
  nodes?: ContentDraftNodeView[]
  pipelineRef: string
  workflowRef: string
  ruleRef: string
  status: ContentStatus
  approval?: ContentApprovalState
  variantId?: string | null
  experimentId?: string | null
  createdAt: string
  updatedAt: string
  newsMeta?: {
    title: string
    url: string
    sourceId: string
    publishedAt: string
    relevanceScore: number
    suggestedAngle: string
  } | null
  creditUsage?: {
    totalCredits: number
    byNodeId: Record<string, number>
  }
}

export type AvailableNodeTypesResponse = {
  types: WorkflowNodeType[]
}

export type GenerateNodeBody = {
  type: WorkflowNodeType
  nodeId?: string
  config?: Record<string, unknown>
  /** @deprecated Use `config` instead. */
  userPrompt?: string
  /** Optional direction for this extra output. */
  message?: string
  /** Reference images for image_generation (multipart). */
  attachments?: Array<{ id: string; label: string; file: File }>
}

export type GenerateNodeResponse = {
  success: boolean
  nodeId: string
}
