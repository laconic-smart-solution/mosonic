import apiClient from "../api/api-client"

export type HeygenVoice = {
  voiceId: string
  name: string
  language: string
  preview?: string
}

export type HeygenAvatarUploadResult = {
  heygenAvatarId: string
  heygenAvatarAssetId: string
  previewUrl: string
}

export type HeygenBackgroundUploadResult = {
  heygenBackgroundAssetId: string
  previewUrl: string
}

export const heygenService = {
  listVoices: async (params?: {
    language?: string
    gender?: string
  }): Promise<HeygenVoice[]> => {
    const response = await apiClient.get<HeygenVoice[]>("/workflow/heygen/voices", {
      params,
    })
    return response.data
  },

  uploadAvatar: async (
    workflowId: string,
    nodeId: string,
    file: File,
  ): Promise<HeygenAvatarUploadResult> => {
    const form = new FormData()
    form.append("file", file)
    const response = await apiClient.post<HeygenAvatarUploadResult>(
      `/workflow/${workflowId}/nodes/${nodeId}/heygen/upload-avatar`,
      form,
    )
    return response.data
  },

  patchPresenterConfig: async (
    workflowId: string,
    nodeId: string,
    config: Record<string, unknown>,
  ): Promise<Record<string, unknown>> => {
    const response = await apiClient.patch<Record<string, unknown>>(
      `/workflow/${workflowId}/nodes/${nodeId}/heygen/config`,
      { config },
    )
    return response.data
  },

  uploadBackground: async (
    workflowId: string,
    nodeId: string,
    file: File,
  ): Promise<HeygenBackgroundUploadResult> => {
    const form = new FormData()
    form.append("file", file)
    const response = await apiClient.post<HeygenBackgroundUploadResult>(
      `/workflow/${workflowId}/nodes/${nodeId}/heygen/upload-background`,
      form,
    )
    return response.data
  },
}
