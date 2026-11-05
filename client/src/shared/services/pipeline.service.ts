import { buildRuleExtractFormData } from "@/lib/strategy-input"
import apiClient from "../api/api-client"
import type {
  GetPipelineResponse,
  PipelineEstimatePayload,
  PipelineEstimateResponse,
  PipelinePageQueryPayload,
  PipelinePageResponse,
  PipelineStatsResponse,
  NodeReviewPayload,
  NodeReviewResponse,
  ReviewRegenerateEstimateResponse,
  RetryNodePayload,
  RetryNodeResponse,
  SkipNodePayload,
  SkipNodeResponse,
  StartPipelinePayload,
  StartPipelineResponse,
  UpdatePipelineNamePayload,
  UpdatePipelineNameResponse,
} from "../types/pipeline.type"

export const pipelineService = {
  startPipeline: async (
    payload: StartPipelinePayload,
  ): Promise<StartPipelineResponse> => {
    const attachments = payload.attachments ?? []
    const hasFiles = attachments.some(
      (a) => a.type === "file" && a.data instanceof File,
    )
    const hasUrls = attachments.some((a) => a.type === "url")

    if (hasFiles || hasUrls) {
      const fd = buildRuleExtractFormData(
        payload.contentPrompt ?? "",
        attachments,
      )
      // Rule extract uses `input`; pipeline start uses `contentPrompt`.
      if (fd.has("input")) {
        const input = fd.get("input")
        fd.delete("input")
        if (typeof input === "string") fd.append("contentPrompt", input)
      } else if (payload.contentPrompt?.trim()) {
        fd.append("contentPrompt", payload.contentPrompt.trim())
      }
      fd.append("workflowId", payload.workflowId)
      fd.append("ruleId", payload.ruleId)
      if (payload.useLearnings !== undefined) {
        fd.append("useLearnings", String(payload.useLearnings))
      }
      if (payload.executionMode) {
        fd.append("executionMode", payload.executionMode)
      }
      if (payload.reviewNodeIds?.length) {
        fd.append("reviewNodeIds", JSON.stringify(payload.reviewNodeIds))
      }
      const response = await apiClient.post("/pipeline/start", fd)
      return response.data
    }

    const { attachments: _a, ...json } = payload
    const response = await apiClient.post("/pipeline/start", {
      ...json,
      contentPrompt: json.contentPrompt ?? "",
    })
    return response.data
  },

  estimate: async (
    payload: PipelineEstimatePayload,
  ): Promise<PipelineEstimateResponse> => {
    const response = await apiClient.post("/pipeline/estimate", payload)
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

  reviewNode: async (
    pipelineId: string,
    nodeId: string,
    payload: NodeReviewPayload,
  ): Promise<NodeReviewResponse> => {
    const response = await apiClient.post(
      `/pipeline/${pipelineId}/nodes/${nodeId}/review`,
      payload,
    )
    return response.data
  },

  estimateReviewRegenerate: async (
    pipelineId: string,
    nodeId: string,
  ): Promise<ReviewRegenerateEstimateResponse> => {
    const response = await apiClient.get(
      `/pipeline/${pipelineId}/nodes/${nodeId}/review/estimate`,
    )
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

  cancel: async (
    pipelineId: string,
  ): Promise<{
    success: boolean
    keptProgress: boolean
    contentId?: string
    uploadId?: string
  }> => {
    const response = await apiClient.post(`/pipeline/${pipelineId}/cancel`)
    return response.data
  },

  updateName: async (
    pipelineId: string,
    payload: UpdatePipelineNamePayload,
  ): Promise<UpdatePipelineNameResponse> => {
    const response = await apiClient.patch(`/pipeline/${pipelineId}`, payload)
    return response.data
  },
}
