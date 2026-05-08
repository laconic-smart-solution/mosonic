export type WorkflowNodeType =
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
  userPrompt?: string
  config?: Record<string, unknown>
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
