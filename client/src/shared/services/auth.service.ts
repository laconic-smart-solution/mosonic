import axios from "axios"

import { appConfig } from "@/app/config/app-config"

export const authService = {
  /**
   * Refresh using a dedicated axios call so apiClient 401 interceptors are not involved.
   * Refresh token is read from the HttpOnly cookie by the Nest BFF.
   * Body must be empty — sending `null` with Content-Type JSON makes Nest reject
   * with: Unexpected token 'n', "null" is not valid JSON.
   */
  async refresh(): Promise<void> {
    await axios.post(`${appConfig.apiBaseUrl}/auth/refresh`, undefined, {
      withCredentials: true,
    })
  },

  async logout(): Promise<void> {
    await axios.post(`${appConfig.apiBaseUrl}/auth/logout`, undefined, {
      withCredentials: true,
    })
  },
}
