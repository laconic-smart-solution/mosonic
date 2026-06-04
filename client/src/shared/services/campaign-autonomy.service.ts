import apiClient from "../api/api-client"

export type CampaignAutonomyPolicy = {
  ruleRef: string
  enabled: boolean
  mode: "off" | "review_optional" | "full_auto"
  allowedChannels: string[]
  maxPostsPerDay: number
  blockIfPendingSuggestions: boolean
}

export const campaignAutonomyService = {
  getForRule: async (ruleId: string): Promise<CampaignAutonomyPolicy | null> => {
    const response = await apiClient.get(`/campaign/autonomy/rule/${ruleId}`)
    return response.data
  },

  upsert: async (
    ruleId: string,
    body: Partial<CampaignAutonomyPolicy>,
  ): Promise<CampaignAutonomyPolicy> => {
    const response = await apiClient.put(`/campaign/autonomy/rule/${ruleId}`, body)
    return response.data
  },
}
