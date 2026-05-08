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
  currentVersion: number
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
  /** Merged userEdits over outputs for current version (when backend provides). */
  outputs?: ContentOutputs
  pipelineRef: string
  workflowRef: string
  ruleRef: string
  currentVersion: number
  versions: Array<{
    versionNumber: number
    outputs?: Record<string, unknown>
    userEdits?: Record<string, unknown>
    createdAt: string
  }>
  status: ContentStatus
  createdAt: string
  updatedAt: string
}
