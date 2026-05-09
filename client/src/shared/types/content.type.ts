export type ContentStatus = "draft" | "approved" | "rejected"

export type ContentPageQueryPayload = {
  page?: number
  limit?: number
  filter?: {
    workflowRef?: string
    ruleRef?: string
    pipelineRef?: string
    status?: ContentStatus
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
  pipelineRef: string
  workflowRef: string
  ruleRef: string
  status: ContentStatus
  createdAt: string
  updatedAt: string
}
