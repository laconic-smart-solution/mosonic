import type { WorkflowQAAnswers } from "@/features/workflow/types/workflow-qa.type"

export type WorkflowNodeType =
  | "keyword_planner"
  | "text_generation"
  | "image_generation"
  | "video_generation"
  | "translation"
  | "transcription"
  | "summarization"
  | "branch"
  | "adapt"
  | "merge"
  | "intelligence"

export type WorkflowEdge = {
  from: string
  to: string
  sourceHandle?: string
  targetHandle?: string
}

export type WorkflowNode = {
  nodeId: string
  type: WorkflowNodeType
  order: number
  isLocked: boolean
  config?: Record<string, unknown>
  /** Optional; may still appear on API payloads for re-run context. */
  userPrompt?: string
  /** Canvas coordinates for workflow editor layout. */
  x?: number
  y?: number
  /** Authoring lane (channel handle id); mirrors config.laneId for lane subgraph nodes. */
  lane?: string
}


export type GenerateWorkflowPayload = {
  ruleId: string
  answers: WorkflowQAAnswers
}

export type GenerateWorkflowResponse = {
  workflowId: string
  ruleId: string
}

export type WorkflowStatus = "generating" | "ready" | "failed" | "archived"

export type GetWorkflowResponse = {
  workflow: { workflowId: string; name: string; status: WorkflowStatus; ruleRef: string }
  nodes: WorkflowNode[]
  edges?: WorkflowEdge[]
}

export type SaveWorkflowNodesPayload = {
  name?: string
  nodes: Array<Omit<WorkflowNode, "nodeId"> & { nodeId?: string }>
  edges?: WorkflowEdge[]
}

export type UpdateWorkflowPayload = {
  name: string
}

export type UpdateWorkflowResponse = {
  workflowId: string
  name: string
}

export type SaveWorkflowNodesByRulePayload = SaveWorkflowNodesPayload & {
  name?: string
}

export type SaveWorkflowNodesByRuleResponse = {
  workflowId: string
  success: boolean
}

export type ApplyPipelineToWorkflowResponse = {
  workflowId: string
  contentPrompt: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
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
