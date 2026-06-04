import apiClient from "@/shared/api/api-client"
import type {
  CostBudgetSettings,
  CostBudgetUpdate,
  CostDashboard,
  CostMonthly,
  PipelineCostBreakdown,
} from "@/shared/types/cost.type"

export const costService = {
  async getDashboard(params?: {
    from?: string
    to?: string
    campaignRef?: string
  }): Promise<CostDashboard> {
    const { data } = await apiClient.get<CostDashboard>("/cost/dashboard", { params })
    return data
  },

  async getMonthly(): Promise<CostMonthly> {
    const { data } = await apiClient.get<CostMonthly>("/cost/monthly")
    return data
  },

  async getPipelineBreakdown(pipelineId: string): Promise<PipelineCostBreakdown> {
    const { data } = await apiClient.get<PipelineCostBreakdown>(`/cost/pipeline/${pipelineId}`)
    return data
  },

  async getBudget(): Promise<CostBudgetSettings> {
    const { data } = await apiClient.get<CostBudgetSettings>("/cost/budget")
    return data
  },

  async updateBudget(body: CostBudgetUpdate): Promise<CostBudgetSettings> {
    const { data } = await apiClient.put<CostBudgetSettings>("/cost/budget", body)
    return data
  },
}
