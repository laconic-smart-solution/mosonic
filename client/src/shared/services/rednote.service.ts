import apiClient from "../api/api-client"

export type RedNoteAccountStatus = {
  connected: boolean
  status: string
  sessionStatus: string | null
  lastVerifiedAt: string | null
  needsReauth: boolean
  handle: string | null
}

export type RedNoteConnectResponse = {
  socketRoom: string
}

export const rednoteService = {
  unlock: async (): Promise<{ unlocked: true; alreadyUnlocked: boolean }> => {
    const response = await apiClient.post(`/rednote/unlock`)
    return response.data
  },

  connect: async (): Promise<RedNoteConnectResponse> => {
    const response = await apiClient.post(`/rednote/connect`)
    return response.data
  },

  cancelConnect: async (): Promise<{ cancelled: boolean }> => {
    const response = await apiClient.post(`/rednote/connect/cancel`)
    return response.data
  },

  getLatestQr: async (): Promise<{ image: string | null }> => {
    const response = await apiClient.get(`/rednote/connect/qr`)
    return response.data
  },

  getAccount: async (): Promise<RedNoteAccountStatus> => {
    const response = await apiClient.get(`/rednote/accounts`)
    return response.data
  },

  healthCheck: async (): Promise<{ status: "active" | "needs_reauth" }> => {
    const response = await apiClient.post(`/rednote/health-check`)
    return response.data
  },

  disconnect: async (): Promise<{ success: boolean }> => {
    const response = await apiClient.delete(`/rednote/accounts`)
    return response.data
  },
}
