import apiClient from "../api/api-client"
import type {
  GetPipelineResponse,
  PipelinePageQueryPayload,
  PipelinePageResponse,
  PipelineStatsResponse,
  RetryNodePayload,
  RetryNodeResponse,
  SkipNodePayload,
  SkipNodeResponse,
  StartPipelinePayload,
  StartPipelineResponse,
} from "../types/pipeline.type"

export const pipelineService = {
  startPipeline: async (
    payload: StartPipelinePayload,
  ): Promise<StartPipelineResponse> => {
    const response = await apiClient.post("/pipeline/start", payload)
    return response.data
  },

  retryNode: async (
    pipelineId: string,
    payload: RetryNodePayload,
  ): Promise<RetryNodeResponse> => {
    const response = await apiClient.post(`/pipeline/${pipelineId}/retry-node`, payload)
    return response.data
  },

  skipNode: async (
    pipelineId: string,
    payload: SkipNodePayload,
  ): Promise<SkipNodeResponse> => {
    const response = await apiClient.post(`/pipeline/${pipelineId}/skip-node`, payload)
    return response.data
  },

  getById: async (pipelineId: string): Promise<GetPipelineResponse> => {
    const response = await apiClient.get(`/pipeline/${pipelineId}`)
    return response.data
  },

  tryFinalize: async (pipelineId: string): Promise<GetPipelineResponse> => {
    const response = await apiClient.post(`/pipeline/${pipelineId}/finalize`)
    return response.data
  },

  pageable: async (
    payload: PipelinePageQueryPayload
  ): Promise<PipelinePageResponse> => {
    const response = await apiClient.post("/pipeline/pageable", payload)
    return response.data
  },

  stats: async (workflowRef?: string): Promise<PipelineStatsResponse> => {
    const response = await apiClient.get<PipelineStatsResponse>(
      "/pipeline/stats",
      {
        params: workflowRef ? { workflowRef } : undefined,
      },
    )
    return response.data
  },

  cancel: async (pipelineId: string): Promise<{ success: boolean }> => {
    const response = await apiClient.post(`/pipeline/${pipelineId}/cancel`)
    return response.data
  },

  replan: async (
    pipelineId: string,
    operations: Array<
      | { op: "skip_node"; nodeId: string }
      | { op: "retry_node"; nodeId: string }
      | { op: "remove_pending_node"; nodeId: string }
      | {
          op: "insert_node"
          afterNodeId: string
          spec: {
            type: string
            lane?: string | null
            config?: Record<string, unknown>
          }
        }
    >,
  ): Promise<{ success: boolean; nodeCount: number }> => {
    const response = await apiClient.post(`/pipeline/${pipelineId}/replan`, {
      operations,
    })
    return response.data
  },
}
