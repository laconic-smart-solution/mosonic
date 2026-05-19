import type { WorkflowNodeType } from "./workflow.type"

export type StartPipelinePayload = {
  workflowId: string
  ruleId: string
  contentPrompt: string
  useLearnings?: boolean
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
  contentPrompt: string
  nodeCount: number
  nodeTypes: string[]
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

export type PipelineStatsResponse = {
  total: number
  byStatus: Partial<Record<PipelineStatus, number>>
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
  executedAt: string | null
}

export type GetPipelineResponse = {
  pipeline: {
    pipelineId: string
    workflowRef: string
    ruleRef: string
    contentPrompt: string
    status: PipelineStatus
    pausedNodeId?: string | null
    pausedLaneId?: string | null
    startedAt: string
    completedAt: string | null
    contentId?: string
    uploadId?: string
  }
  graph: {
    edges: Array<{ from: string; to: string }>
    lanes: string[]
    layout?: Record<string, { x: number; y: number }>
  }
  nodes: PipelineNodeSnapshot[]
}
