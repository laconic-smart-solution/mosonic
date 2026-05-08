import type { WorkflowNodeType } from "./workflow.type"

export type StartPipelinePayload = {
  workflowId: string
  ruleId: string
  contentPrompt: string
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
