import type { WorkflowNodeType } from "./workflow.type"

export type StartPipelinePayload = {
  workflowId: string
  ruleId: string
  contentPrompt: string
}

export type PipelinePageQueryPayload = {
  page?: number
  limit?: number
  filter?: {
    workflowRef?: string
  }
  sortBy?: "startedAt" | "completedAt"
  sortOrder?: "asc" | "desc"
}

export type PipelinePageItem = {
  pipelineId: string
  workflowRef: string
  ruleRef: string
  status: PipelineStatus
  contentPrompt: string
  nodeCount: number
  startedAt: string
  completedAt: string | null
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

export type StartPipelineResponse = {
  pipelineId: string
}

export type RetryNodePayload = {
  nodeId: string
}

export type RetryNodeResponse = {
  success: boolean
}

export type PipelineNodeRuntimeStatus = "pending" | "running" | "completed" | "failed"
export type PipelineStatus = "running" | "paused" | "completed" | "failed"

export type PipelineNodeSnapshot = {
  nodeId: string
  type: WorkflowNodeType
  order: number
  isLocked: boolean
  userPrompt: string
  config: Record<string, unknown>
  status: PipelineNodeRuntimeStatus
  output: Record<string, unknown> | null
  retryCount: number
  executedAt: string | null
}

export type GetPipelineResponse = {
  pipeline: {
    pipelineId: string
    workflowRef: string
    ruleRef: string
    contentPrompt: string
    status: PipelineStatus
    startedAt: string
    completedAt: string | null
  }
  nodes: PipelineNodeSnapshot[]
}
