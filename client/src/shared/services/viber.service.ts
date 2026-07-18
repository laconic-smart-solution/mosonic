import apiClient from "../api/api-client"

export type ViberQrCode = {
  uri: string
  botUrl: string
  qrImage: string
}

export type ViberConnectStart = {
  connected: boolean
  code?: string
  expiresInSeconds?: number
  connectMessage?: string
  viberUserId?: string
  connectedAt?: string
  uri: string
  botUrl: string
  qrImage: string
}

export type ViberConnectStatus = {
  connected: boolean
  viberUserId?: string
  connectedAt?: string
  pendingCode?: string
  expiresInSeconds?: number
  connectMessage?: string
}

export const viberService = {
  getQrCode: async (params?: {
    uri?: string
    size?: number
    start?: string
  }) => {
    const response = await apiClient.get<ViberQrCode>("/viber/qr", {
      params,
    })
    return response.data
  },

  startConnect: async () => {
    const response = await apiClient.post<ViberConnectStart>("/viber/connect")
    return response.data
  },

  getConnectStatus: async () => {
    const response = await apiClient.get<ViberConnectStatus>(
      "/viber/connect/status",
    )
    return response.data
  },

  disconnect: async () => {
    const response = await apiClient.delete<{ success: boolean }>(
      "/viber/connect",
    )
    return response.data
  },
}
