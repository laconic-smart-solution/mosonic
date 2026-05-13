import apiClient from "../api/api-client"
import type {
  PatchUploadChannelBody,
  PatchUploadChannelSuccess,
  PublishUploadRequest,
  PublishUploadSuccess,
  UpdateUploadBody,
  UpdateUploadSuccess,
  UploadDetail,
  UploadStatusDetail,
} from "../types/upload.type"

export const uploadService = {
  findIdByContentRef: async (
    contentRef: string
  ): Promise<{ uploadId: string }> => {
    const response = await apiClient.get<{ uploadId: string }>(
      `/upload/by-content/${encodeURIComponent(contentRef)}`
    )
    return response.data
  },

  getById: async (uploadId: string): Promise<UploadDetail> => {
    const response = await apiClient.get<UploadDetail>(`/upload/${uploadId}`)
    return response.data
  },

  patchChannel: async (
    uploadId: string,
    channel: string,
    body: PatchUploadChannelBody
  ): Promise<PatchUploadChannelSuccess> => {
    const response = await apiClient.patch<PatchUploadChannelSuccess>(
      `/upload/${uploadId}/channels/${encodeURIComponent(channel)}`,
      body
    )
    return response.data
  },

  update: async (
    uploadId: string,
    body: UpdateUploadBody
  ): Promise<UpdateUploadSuccess> => {
    const response = await apiClient.patch<UpdateUploadSuccess>(
      `/upload/${uploadId}`,
      body
    )
    return response.data
  },

  publish: async (
    uploadId: string,
    body: PublishUploadRequest
  ): Promise<PublishUploadSuccess> => {
    const response = await apiClient.post<PublishUploadSuccess>(
      `/upload/${uploadId}/publish`,
      body
    )
    return response.data
  },

  retry: async (uploadId: string): Promise<PublishUploadSuccess> => {
    const response = await apiClient.post<PublishUploadSuccess>(
      `/upload/${uploadId}/retry`
    )
    return response.data
  },

  getStatus: async (uploadId: string): Promise<UploadStatusDetail> => {
    const response = await apiClient.get<UploadStatusDetail>(
      `/upload/${uploadId}/status`
    )
    return response.data
  },
}
