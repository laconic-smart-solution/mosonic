import apiClient from "../api/api-client"

export type TelegramQrCode = {
  botUsername: string
  botUrl: string
  qrImage: string
}

export type TelegramConnectStart = {
  connected: boolean
  code?: string
  expiresInSeconds?: number
  connectMessage?: string
  telegramChatId?: string
  connectedAt?: string
  botUsername: string
  botUrl: string
  qrImage: string
}

export type TelegramConnectStatus = {
  connected: boolean
  telegramChatId?: string
  connectedAt?: string
  pendingCode?: string
  expiresInSeconds?: number
  connectMessage?: string
}

export const telegramService = {
  getQrCode: async (params?: {
    botUsername?: string
    size?: number
    start?: string
  }) => {
    const response = await apiClient.get<TelegramQrCode>("/telegram/qr", {
      params,
    })
    return response.data
  },

  startConnect: async () => {
    const response = await apiClient.post<TelegramConnectStart>(
      "/telegram/connect",
    )
    return response.data
  },

  getConnectStatus: async () => {
    const response = await apiClient.get<TelegramConnectStatus>(
      "/telegram/connect/status",
    )
    return response.data
  },

  disconnect: async () => {
    const response = await apiClient.delete<{ success: boolean }>(
      "/telegram/connect",
    )
    return response.data
  },
}
