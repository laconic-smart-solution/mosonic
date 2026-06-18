import apiClient from "@/shared/api/api-client"
import type {
  CurrentPlanResponse,
  UsageHistoryResponse,
  UsageSummary,
} from "@/shared/types/usage.type"

export const usageService = {
  getSummary: () => apiClient.get<UsageSummary>("/usage/summary").then((r) => r.data),

  getHistory: (params?: {
    from?: string
    to?: string
    nodeType?: string
    page?: number
    limit?: number
  }) =>
    apiClient.get<UsageHistoryResponse>("/usage/history", { params }).then((r) => r.data),

  getCurrentPlan: () =>
    apiClient.get<CurrentPlanResponse>("/usage/current-plan").then((r) => r.data),
}
