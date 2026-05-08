import apiClient from "../api/api-client"

export const authService = {
  refresh: async () => {
    const response = await apiClient.post("/auth/refresh")
    return response.data
  },
}
