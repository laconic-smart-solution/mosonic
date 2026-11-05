import apiClient from "../api/api-client"

export type RuleMemoryType = "preference" | "correction" | "fact"

export type RuleMemory = {
  ruleMemoryId: string
  ruleId: string
  type: RuleMemoryType
  body: string
  createdAt: string
  updatedAt: string
}

export const ruleMemoryService = {
  list: async (ruleId: string): Promise<RuleMemory[]> => {
    const response = await apiClient.get(`/rules/${ruleId}/memories`)
    return response.data
  },
}
