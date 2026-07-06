import type { WorkflowNodeType } from "./workflow.type"

export type StartPipelinePayload = {
  workflowId: string
  ruleId: string
  contentPrompt: string
  useLearnings?: boolean
  executionMode?: "auto" | "step"
}

export type StartPipelineResponse = {
  pipelineId: string
}

export type PipelineEstimatePayload = {
  workflowId: string
  ruleId?: string
}

export type PipelineEstimateBreakdownItem = {
  nodeType: string
  count: number
  creditsEach: number
  creditsTotal: number
}

export type PipelineEstimateResponse = {
  totalCredits: number
  breakdown: PipelineEstimateBreakdownItem[]
  creditsRemaining: number
  sufficient: boolean
}

export type PipelinePageQueryPayload = {
  page?: number
  limit?: number
  filter?: {
    workflowRef?: string
    status?: PipelineStatus
  }
  sortBy?: "startedAt" | "completedAt"
  sortOrder?: "asc" | "desc"
}

export type PipelinePageItem = {
  pipelineId: string
  workflowRef: string
  ruleRef: string
  status: PipelineStatus
  name: string
  contentPrompt: string
  nodeCount: number
  nodeTypes: string[]
  startedAt: string
  completedAt: string | null
  metadataSource?: string
  newsTitle?: string
  ruleName?: string
}

export type PipelinePageResponse = {
  data: PipelinePageItem[]
  meta: {
    total: number
    page: number
    limit: number
    totalPages: number
  }
}

export type PipelineStatsResponse = {
  total: number
  byStatus: Partial<Record<PipelineStatus, number>>
}

export type UpdatePipelineNamePayload = {
  name: string
}

export type UpdatePipelineNameResponse = {
  pipelineId: string
  name: string
}

export type NodeReviewPayload = {
  action: "continue" | "edit" | "regenerate"
  editedContent?: string
  regenerateInstruction?: string
  mediaUrl?: string
}

export type NodeReviewResponse = {
  success: boolean
  noop?: boolean
}

export type ReviewRegenerateEstimateResponse = {
  creditsRequired: number
  creditsRemaining: number
  sufficient: boolean
  creditNodeType: string | null
}

export type RetryNodePayload = {
  nodeId: string
}

export type RetryNodeResponse = {
  success: boolean
}

export type SkipNodePayload = {
  nodeId: string
}

export type SkipNodeResponse = {
  success: boolean
}

export type PipelineNodeRuntimeStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped"
  | "waiting_review"
export type PipelineStatus = "running" | "paused" | "completed" | "failed"

export type PipelineNodeSnapshot = {
  nodeId: string
  type: WorkflowNodeType
  order: number
  isLocked: boolean
  userPrompt: string
  config: Record<string, unknown>
  lane?: string | null
  status: PipelineNodeRuntimeStatus
  output: Record<string, unknown> | null
  retryCount: number
  reviewRegenerateCount?: number
  executedAt: string | null
}

export type GetPipelineResponse = {
  pipeline: {
    pipelineId: string
    workflowRef: string
    ruleRef: string
    name: string
    contentPrompt: string
    status: PipelineStatus
    executionMode?: "auto" | "step"
    pausedNodeId?: string | null
    pausedLaneId?: string | null
    startedAt: string
    completedAt: string | null
    contentId?: string
    uploadId?: string
  }
  graph: {
    edges: Array<{
      from: string
      to: string
      sourceHandle?: string
      targetHandle?: string
    }>
    lanes: string[]
    layout?: Record<string, { x: number; y: number }>
  }
  nodes: PipelineNodeSnapshot[]
}
