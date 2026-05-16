import type { WorkflowNodeType } from "./workflow.type"

export type ContentStatus = "draft" | "approved" | "rejected"

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
  createdAt: string
  updatedAt: string
}

export type AvailableNodeTypesResponse = {
  types: WorkflowNodeType[]
}

export type GenerateNodeBody = {
  type: WorkflowNodeType
  config?: Record<string, unknown>
  /** @deprecated Use `config` instead. */
  userPrompt?: string
}

export type GenerateNodeResponse = {
  success: boolean
  nodeId: string
}
