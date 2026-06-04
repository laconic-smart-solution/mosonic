import apiClient from "@/shared/api/api-client"
import type { DashboardResponse } from "@/shared/types/dashboard.type"

export const dashboardService = {
  async get(): Promise<DashboardResponse> {
    const { data } = await apiClient.get<DashboardResponse>("/dashboard")
    return data
  },
}

