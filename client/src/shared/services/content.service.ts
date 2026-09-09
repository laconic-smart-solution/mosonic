import apiClient from "../api/api-client"
import type {
  AvailableNodeTypesResponse,
  ContentDetail,
  ContentOutputs,
  ContentPageQueryPayload,
  ContentPageResponse,
  ContentStatsResponse,
  GenerateNodeBody,
  GenerateNodeResponse,
} from "../types/content.type"

export type SaveContentBody = {
  userEdits: Partial<ContentOutputs>
  newOutputs?: Partial<ContentOutputs>
  nodeUserEdits?: Record<string, Record<string, unknown>>
}

export type RerunNodeBody = {
  nodeId: string
  updatedConfig?: Record<string, unknown>
  /** @deprecated Use `updatedConfig` instead. */
  updatedPrompt?: string
  /** Follow-up instruction for this specific re-run, e.g. "make the background darker". */
  message?: string
  previousOutputs?: Partial<ContentOutputs>
}

export const contentService = {
  pageable: async (payload: ContentPageQueryPayload): Promise<ContentPageResponse> => {
    const response = await apiClient.post("/contents/pageable", payload)
    return response.data
  },

  stats: async (): Promise<ContentStatsResponse> => {
    const response = await apiClient.get("/contents/stats")
    return response.data
  },

  getById: async (contentId: string): Promise<ContentDetail> => {
    const response = await apiClient.get(`/contents/${contentId}`)
    return response.data
  },

  getAvailableNodeTypes: async (
    contentId: string
  ): Promise<AvailableNodeTypesResponse> => {
    const response = await apiClient.get(`/contents/${contentId}/available-node-types`)
    return response.data
  },

  generateNode: async (
    contentId: string,
    body: GenerateNodeBody
  ): Promise<GenerateNodeResponse> => {
    const response = await apiClient.post(`/contents/${contentId}/generate-node`, body)
    return response.data
  },

  save: async (
    contentId: string,
    body: SaveContentBody
  ): Promise<{ success: boolean }> => {
    const response = await apiClient.post(`/contents/${contentId}/save`, body)
    return response.data
  },

  rerunNode: async (
    contentId: string,
    body: RerunNodeBody
  ): Promise<{ success: boolean }> => {
    const response = await apiClient.post(`/contents/${contentId}/rerun-node`, body)
    return response.data
  },

  approve: async (contentId: string): Promise<{ uploadId: string }> => {
    const response = await apiClient.post(`/contents/${contentId}/approve`)
    return response.data
  },

  reject: async (contentId: string): Promise<{ success: boolean }> => {
    const response = await apiClient.post(`/contents/${contentId}/reject`)
    return response.data
  },

  ensureUpload: async (
    contentId: string
  ): Promise<{ uploadId: string }> => {
    const response = await apiClient.post<{ uploadId: string }>(
      `/contents/${contentId}/ensure-upload`
    )
    return response.data
  },
}
