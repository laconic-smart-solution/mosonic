import apiClient from "../api/api-client"
import type { PublishUploadResponse, UploadDetail } from "../types/upload.type"

export const uploadService = {
  getById: async (uploadId: string): Promise<UploadDetail> => {
    const response = await apiClient.get<UploadDetail>(`/upload/${uploadId}`)
    return response.data
  },

  publish: async (uploadId: string): Promise<PublishUploadResponse> => {
    const response = await apiClient.post<PublishUploadResponse>(
      `/upload/${uploadId}/publish`
    )
    return response.data
  },
}
