import apiClient from "@/shared/api/api-client"
import type { AnalyticsLatestResponse, AnalyticsListResponse, AnalyticsSnapshot } from "@/shared/types/analytics.type"

export const analyticsService = {
  async list(params: { page?: number; limit?: number; ruleId?: string }): Promise<AnalyticsListResponse> {
    const { data } = await apiClient.get<AnalyticsListResponse>("/analytics", { params })
    return data
  },

  async getById(analyticsId: string): Promise<{ analytics: AnalyticsSnapshot }> {
    const { data } = await apiClient.get<{ analytics: AnalyticsSnapshot }>(`/analytics/${analyticsId}`)
    return data
  },

  async latest(ruleId: string): Promise<AnalyticsLatestResponse> {
    const { data } = await apiClient.get<AnalyticsLatestResponse>(`/analytics/latest/${ruleId}`)
    return data
  },

  async pull(ruleId: string): Promise<{ analyticsId: string }> {
    const { data } = await apiClient.post<{ analyticsId: string }>(`/analytics/pull/${ruleId}`)
    return data
  },

  async generateSuggestions(
    analyticsId: string,
  ): Promise<{ analyticsId: string; suggestionCount: number }> {
    const { data } = await apiClient.post<{ analyticsId: string; suggestionCount: number }>(
      `/analytics/${analyticsId}/suggestions/generate`,
    )
    return data
  },

  async applySuggestion(analyticsId: string, index: number): Promise<void> {
    await apiClient.post(`/analytics/${analyticsId}/suggestions/${index}/apply`)
  },

  async rejectSuggestion(analyticsId: string, index: number): Promise<void> {
    await apiClient.post(`/analytics/${analyticsId}/suggestions/${index}/reject`)
  },
}
