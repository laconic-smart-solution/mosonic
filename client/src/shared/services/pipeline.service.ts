import apiClient from "../api/api-client"
import type {
  GetPipelineResponse,
  PipelinePageQueryPayload,
  PipelinePageResponse,
  RetryNodePayload,
  RetryNodeResponse,
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

  getById: async (pipelineId: string): Promise<GetPipelineResponse> => {
    const response = await apiClient.get(`/pipeline/${pipelineId}`)
    return response.data
  },

  pageable: async (
    payload: PipelinePageQueryPayload
  ): Promise<PipelinePageResponse> => {
    const response = await apiClient.post("/pipeline/pageable", payload)
    return response.data
  },
}
