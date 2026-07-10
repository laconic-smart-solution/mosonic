import axios from "axios"

import { appConfig } from "@/app/config/app-config"

export const authService = {
  /**
   * Refresh using a dedicated axios call so apiClient 401 interceptors are not involved.
   * Refresh token is read from the HttpOnly cookie by the Nest BFF.
   */
  async refresh(): Promise<void> {
    await axios.post(
      `${appConfig.apiBaseUrl}/auth/refresh`,
      null,
      {
        withCredentials: true,
        headers: { "Content-Type": "application/json" },
      },
    )
  },

  async logout(): Promise<void> {
    await axios.post(
      `${appConfig.apiBaseUrl}/auth/logout`,
      null,
      {
        withCredentials: true,
      },
    )
  },
}
