import apiClient from "../api/api-client"
import type {
  ZernioConnectedAccountsResponse,
  ZernioConnectionCreditResponse,
} from "../types/zernio.type"

export const zernioService = {
  createProfile: async (): Promise<{ zernioProfileId: string }> => {
    const response = await apiClient.post(`/zernio/profile/create`)
    return response.data
  },

  getConnectionCredit: async (): Promise<ZernioConnectionCreditResponse> => {
    const response = await apiClient.get(`/zernio/connection-credit`)
    return response.data
  },

  getConnectUrl: async (platform: string): Promise<{ connectUrl: string }> => {
    const response = await apiClient.get(`/zernio/connect/${platform}`)
    return response.data
  },

  syncAccounts: async (): Promise<ZernioConnectedAccountsResponse> => {
    const response = await apiClient.post(`/zernio/accounts/sync`)
    return response.data
  },

  getAccounts: async (): Promise<ZernioConnectedAccountsResponse> => {
    const response = await apiClient.get(`/zernio/accounts`)
    return response.data
  },

  disconnectAccount: async (channel: string): Promise<{ success: boolean }> => {
    const response = await apiClient.delete(`/zernio/accounts/${channel}`)
    return response.data
  },
}

