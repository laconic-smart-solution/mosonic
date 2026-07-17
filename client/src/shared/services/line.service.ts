import apiClient from "../api/api-client"

export type LineQrCode = {
  basicId: string
  addFriendUrl: string
  qrImage: string
}

export type LineConnectStart = {
  connected: boolean
  code?: string
  expiresInSeconds?: number
  connectMessage?: string
  lineUserId?: string
  connectedAt?: string
  basicId: string
  addFriendUrl: string
  qrImage: string
}

export type LineConnectStatus = {
  connected: boolean
  lineUserId?: string
  connectedAt?: string
  pendingCode?: string
  expiresInSeconds?: number
  connectMessage?: string
}

export const lineService = {
  getQrCode: async (params?: { basicId?: string; size?: number }) => {
    const response = await apiClient.get<LineQrCode>("/line/qr", { params })
    return response.data
  },

  startConnect: async () => {
    const response = await apiClient.post<LineConnectStart>("/line/connect")
    return response.data
  },

  getConnectStatus: async () => {
    const response = await apiClient.get<LineConnectStatus>("/line/connect/status")
    return response.data
  },

  disconnect: async () => {
    const response = await apiClient.delete<{ success: boolean }>("/line/connect")
    return response.data
  },
}
