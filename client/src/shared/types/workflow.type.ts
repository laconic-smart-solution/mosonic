export type WorkflowNodeType =
  | "keyword_planner"
  | "text_generation"
  | "image_generation"
  | "video_generation"
  | "translation"
  | "transcription"
  | "summarization"

export type WorkflowNode = {
  nodeId: string
  type: WorkflowNodeType
  order: number
  isLocked: boolean
  config?: Record<string, unknown>
  /** Optional; may still appear on API payloads for re-run context. */
  userPrompt?: string
}

export type GenerateWorkflowPayload = {
  contentPrompt: string
  ruleId?: string
}

export type GenerateWorkflowResponse = {
  workflowId: string
  ruleId: string
}

export type WorkflowStatus = "generating" | "ready" | "failed" | "archived"

export type GetWorkflowResponse = {
  workflow: { workflowId: string; name: string; status: WorkflowStatus; ruleRef: string }
  nodes: WorkflowNode[]
}

export type SaveWorkflowNodesPayload = {
  nodes: Omit<WorkflowNode, "nodeId">[]
}

export type WorkflowPageFilter = {
  q?: string
  nodeType?: WorkflowNodeType
}

export type WorkflowPageQueryPayload = {
  page?: number
  limit?: number
  filter?: WorkflowPageFilter
  sortBy?: "name" | "updatedAt" | "createdAt"
  sortOrder?: "asc" | "desc"
}

export type WorkflowPageItem = {
  workflowId: string
  ruleRef: string
  name: string
  status: WorkflowStatus
  updatedAt: string
  nodeTypes: string[]
}

export type WorkflowPageResponse = {
  data: WorkflowPageItem[]
  meta: {
    total: number
    page: number
    limit: number
    totalPages: number
  }
}
