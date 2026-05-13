import axios from "axios"

import { appConfig } from "@/app/config/app-config"

import { extractTokensFromAuthResponse } from "../lib/extract-auth-tokens"

export const authService = {
  /**
   * Refresh using a dedicated axios call so apiClient 401 interceptors are not involved.
   */
  async refreshWithRefreshToken(refreshToken: string): Promise<{
    accessToken: string
    refreshToken: string
  }> {
    const { data } = await axios.post<unknown>(
      `${appConfig.apiBaseUrl}/auth/refresh`,
      { refreshToken },
      {
        headers: { "Content-Type": "application/json" },
        withCredentials: true,
      },
    )
    const tokens = extractTokensFromAuthResponse(data)
    if (!tokens.accessToken) {
      throw new Error("Refresh failed: no access token in response")
    }
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? refreshToken,
    }
  },
}
