import apiClient from "../api/api-client"

export type HeygenVoice = {
  voiceId: string
  name: string
  language: string
  gender?: string
  previewAudioUrl?: string
  type?: string
}

export type HeygenVoicesPage = {
  voices: HeygenVoice[]
  hasMore: boolean
  nextToken?: string
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

export type HeygenAvatarLook = {
  lookId: string
  name: string
  avatarType: string
  previewImageUrl?: string
  defaultVoiceId?: string
  status?: string
  deletable: boolean
}

export const HEYGEN_VOICE_PAGE_SIZE = 20

export const heygenService = {
  listVoicesPage: async (params?: {
    language?: string
    gender?: string
    limit?: number
    token?: string
  }): Promise<HeygenVoicesPage> => {
    const response = await apiClient.get<HeygenVoicesPage>(
      "/workflow/heygen/voices",
      { params },
    )
    return response.data
  },

  getVoice: async (voiceId: string): Promise<HeygenVoice> => {
    const response = await apiClient.get<HeygenVoice>(
      `/workflow/heygen/voices/${encodeURIComponent(voiceId)}`,
    )
    return response.data
  },

  /** Proxied preview (HeyGen CDN blocks browser CORS). */
  fetchVoicePreviewBlob: async (voiceId: string): Promise<Blob> => {
    const response = await apiClient.get<ArrayBuffer>(
      `/workflow/heygen/voices/${encodeURIComponent(voiceId)}/preview`,
      { responseType: "arraybuffer" },
    )
    const contentType =
      (response.headers["content-type"] as string | undefined)?.split(";")[0]
        ?.trim() || "audio/wav"
    return new Blob([response.data], { type: contentType })
  },

  listAvatars: async (): Promise<HeygenAvatarLook[]> => {
    const response = await apiClient.get<HeygenAvatarLook[]>(
      "/workflow/heygen/avatars",
    )
    return response.data
  },

  deleteAvatar: async (lookId: string): Promise<void> => {
    await apiClient.delete(`/workflow/heygen/avatars/${encodeURIComponent(lookId)}`)
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
