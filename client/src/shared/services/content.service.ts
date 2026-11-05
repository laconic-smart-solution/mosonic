import apiClient from "../api/api-client"
import type {
  AvailableNodeTypesResponse,
  ContentDetail,
  ContentSectionItem,
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
  /** Reference images for image_generation re-run (multipart). */
  attachments?: Array<{ id: string; label: string; file: File }>
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
    const attachments = body.attachments ?? []
    if (attachments.length > 0) {
      const fd = new FormData()
      fd.append("type", body.type)
      if (body.nodeId) fd.append("nodeId", body.nodeId)
      if (body.message?.trim()) fd.append("message", body.message.trim())
      if (body.userPrompt?.trim()) fd.append("userPrompt", body.userPrompt.trim())
      if (body.config) fd.append("config", JSON.stringify(body.config))
      for (const a of attachments) {
        fd.append("files", a.file, a.label || a.file.name)
      }
      const response = await apiClient.post(
        `/contents/${contentId}/generate-node`,
        fd,
      )
      return response.data
    }

    const { attachments: _a, ...json } = body
    const response = await apiClient.post(
      `/contents/${contentId}/generate-node`,
      json,
    )
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
    const attachments = body.attachments ?? []
    if (attachments.length > 0) {
      const fd = new FormData()
      fd.append("nodeId", body.nodeId)
      if (body.message?.trim()) fd.append("message", body.message.trim())
      if (body.previousOutputs) {
        fd.append("previousOutputs", JSON.stringify(body.previousOutputs))
      }
      if (body.updatedConfig) {
        fd.append("updatedConfig", JSON.stringify(body.updatedConfig))
      }
      for (const a of attachments) {
        fd.append("files", a.file, a.label || a.file.name)
      }
      const response = await apiClient.post(
        `/contents/${contentId}/rerun-node`,
        fd,
      )
      return response.data
    }

    const { attachments: _a, ...json } = body
    const response = await apiClient.post(
      `/contents/${contentId}/rerun-node`,
      json,
    )
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
  updateSection: async (
    contentId: string,
    sectionKey: string,
    payload: { title?: string; content?: string; items?: string[] },
  ): Promise<{ success: boolean; section: ContentSectionItem; compiledText: string }> => {
    const response = await apiClient.patch(
      `/contents/${contentId}/sections/${encodeURIComponent(sectionKey)}`,
      payload,
    )
    return response.data
  },

  regenerateSection: async (
    contentId: string,
    sectionKey: string,
    payload?: { userInstruction?: string },
  ): Promise<{ success: boolean; section: ContentSectionItem; compiledText: string }> => {
    const response = await apiClient.post(
      `/contents/${contentId}/sections/${encodeURIComponent(sectionKey)}/regenerate`,
      payload ?? {},
    )
    return response.data
  },
}