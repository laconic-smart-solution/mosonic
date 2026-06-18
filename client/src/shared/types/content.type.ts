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
  createdAt: string
  updatedAt: string
  /** Merged userEdits over outputs (matches content detail). */
  outputs?: ContentOutputs
  /** Per-channel adapt outputs (multi-lane runs). */
  laneOutputs?: Record<string, Record<string, unknown>>
  uploadId?: string
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

export type ContentOutputs = {
  keywords?: string
  text?: string
  translatedText?: string
  transcription?: string
  summary?: string
  image?: string
  video?: string
}

export type ContentDetail = {
  contentId: string
  /** Merged userEdits over outputs. */
  outputs?: ContentOutputs
  nodeOutputs?: Record<string, Record<string, unknown>>
  nodeUserEdits?: Record<string, Record<string, unknown>>
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
}

export type GenerateNodeResponse = {
  success: boolean
  nodeId: string
}
