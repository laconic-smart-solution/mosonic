import apiClient from "../api/api-client"

export type WhatsAppQrCode = {
  phone: string
  chatUrl: string
  qrImage: string
}

export type WhatsAppConnectStart = {
  connected: boolean
  code?: string
  expiresInSeconds?: number
  connectMessage?: string
  whatsappWaId?: string
  connectedAt?: string
  phone: string
  chatUrl: string
  qrImage: string
}

export type WhatsAppConnectStatus = {
  connected: boolean
  whatsappWaId?: string
  connectedAt?: string
  pendingCode?: string
  expiresInSeconds?: number
  connectMessage?: string
}

export const whatsappService = {
  getQrCode: async (params?: {
    phone?: string
    size?: number
    text?: string
  }) => {
    const response = await apiClient.get<WhatsAppQrCode>("/whatsapp/qr", {
      params,
    })
    return response.data
  },

  startConnect: async () => {
    const response = await apiClient.post<WhatsAppConnectStart>(
      "/whatsapp/connect",
    )
    return response.data
  },

  getConnectStatus: async () => {
    const response = await apiClient.get<WhatsAppConnectStatus>(
      "/whatsapp/connect/status",
    )
    return response.data
  },

  disconnect: async () => {
    const response = await apiClient.delete<{ success: boolean }>(
      "/whatsapp/connect",
    )
    return response.data
  },
}
