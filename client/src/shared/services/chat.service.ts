import apiClient from "../api/api-client"

export type ChatRole = "user" | "assistant"

export type ChatSession = {
  sessionId: string
  ruleId: string | null
  userId: string | null
  title: string | null
  createdAt: string
  updatedAt: string
}

export type ChatToolCall = {
  name: string
  args: Record<string, unknown>
  result: string
}

export type AgentStep =
  | { type: "thought"; text: string; durationMs?: number }
  | {
      type: "action"
      name: string
      args: Record<string, unknown>
      toolCallId?: string
    }
  | {
      type: "observation"
      name: string
      toolCallId?: string
      result: string
    }
  | ({ type: "tool_call" } & ChatToolCall)

/** One page of history, oldest-first; `nextCursor` fetches the page before it. */
export type ChatMessagePage = {
  messages: ChatMessage[]
  hasMore: boolean
  nextCursor: string | null
}

export type ChatMessage = {
  messageId: string
  sessionId: string
  role: ChatRole
  content: string
  steps: AgentStep[] | null
  inputTokens: number | null
  outputTokens: number | null
  createdAt: string
}

export type ChatRunStep = {
  nodeId: string
  name: string
  label: string
  status: "pending" | "running" | "done" | "failed" | "skipped"
  durationMs: number | null
}

/** `chat:run-progress` payload / GET /chat/sessions/:id/runs/:pipelineId. */
export type ChatRunProgress = {
  sessionId: string
  pipelineId: string
  name: string
  status: "running" | "completed" | "failed" | "paused"
  steps: ChatRunStep[]
  currentStep: string | null
  startedAt: string
  completedAt: string | null
  estimatedRemainingMs: number | null
  failedNodeId: string | null
  error: string | null
}

export type ContextUsage = {
  used: number
  limit: number
}

export type ChatTurnResult = {
  userMessage: ChatMessage
  assistantMessage: ChatMessage
  contextUsage: ContextUsage
  session: ChatSession
}

export const chatService = {
  listSessions: async (ruleId: string): Promise<ChatSession[]> => {
    const response = await apiClient.get(`/rules/${ruleId}/chat/sessions`)
    return response.data
  },
  listAllSessions: async (): Promise<ChatSession[]> => {
    const response = await apiClient.get("/chat/sessions")
    return response.data
  },
  createSession: async (ruleId?: string, title?: string): Promise<ChatSession> => {
    const response = await apiClient.post("/chat/sessions", { ruleId, title })
    return response.data
  },
  deleteSession: async (sessionId: string): Promise<void> => {
    await apiClient.delete(`/chat/sessions/${sessionId}`)
  },
  listMessages: async (
    sessionId: string,
    params: { before?: string; limit?: number } = {},
  ): Promise<ChatMessagePage> => {
    const response = await apiClient.get(`/chat/sessions/${sessionId}/messages`, { params })
    return response.data
  },
  getRunProgress: async (sessionId: string, pipelineId: string): Promise<ChatRunProgress> => {
    const response = await apiClient.get(`/chat/sessions/${sessionId}/runs/${pipelineId}`)
    return response.data
  },
  sendMessage: async (sessionId: string, content: string): Promise<ChatTurnResult> => {
    const response = await apiClient.post(`/chat/sessions/${sessionId}/messages`, {
      content,
    })
    return response.data
  },
}
