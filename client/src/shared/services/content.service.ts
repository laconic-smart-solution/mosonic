import apiClient from "../api/api-client"
import type {
  ContentDetail,
  ContentOutputs,
  ContentPageQueryPayload,
  ContentPageResponse,
} from "../types/content.type"

export type SaveContentBody = {
  userEdits: Partial<ContentOutputs>
}

export type RerunNodeBody = {
  nodeId: string
  updatedPrompt?: string
}

export type RestoreVersionBody = {
  versionNumber: number
}

export type ContentVersionSummary = {
  versionNumber: number
  createdAt: string
}

export const contentService = {
  pageable: async (payload: ContentPageQueryPayload): Promise<ContentPageResponse> => {
    const response = await apiClient.post("/contents/pageable", payload)
    return response.data
  },

  getById: async (contentId: string): Promise<ContentDetail> => {
    const response = await apiClient.get(`/contents/${contentId}`)
    return response.data
  },

  save: async (
    contentId: string,
    body: SaveContentBody
  ): Promise<{ versionNumber: number }> => {
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

  getVersions: async (contentId: string): Promise<ContentVersionSummary[]> => {
    const response = await apiClient.get(`/contents/${contentId}/versions`)
    return response.data
  },

  restoreVersion: async (
    contentId: string,
    body: RestoreVersionBody
  ): Promise<{ success: boolean }> => {
    const response = await apiClient.post(`/contents/${contentId}/restore`, body)
    return response.data
  },
}
