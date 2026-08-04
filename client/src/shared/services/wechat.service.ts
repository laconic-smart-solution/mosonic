import apiClient from "../api/api-client"

export type WechatQrCode = {
  sceneStr: string
  chatUrl: string
  qrImage: string
}

export type WechatConnectStart = {
  connected: boolean
  code?: string
  expiresInSeconds?: number
  connectMessage?: string
  wechatOpenId?: string
  connectedAt?: string
  oaUsername: string
  chatUrl: string
  qrImage: string
}

export type WechatConnectStatus = {
  connected: boolean
  wechatOpenId?: string
  connectedAt?: string
  pendingCode?: string
  expiresInSeconds?: number
  connectMessage?: string
}

export const wechatService = {
  getQrCode: async (params?: {
    sceneStr?: string
    oaUsername?: string
    size?: number
  }) => {
    const response = await apiClient.get<WechatQrCode>("/wechat/qr", { params })
    return response.data
  },

  startConnect: async () => {
    const response = await apiClient.post<WechatConnectStart>("/wechat/connect")
    return response.data
  },

  getConnectStatus: async () => {
    const response = await apiClient.get<WechatConnectStatus>(
      "/wechat/connect/status",
    )
    return response.data
  },

  disconnect: async () => {
    const response = await apiClient.delete<{ success: boolean }>(
      "/wechat/connect",
    )
    return response.data
  },
}
