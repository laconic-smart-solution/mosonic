import type { RuleEntity } from "@/features/rules/data/rules-mock"

import apiClient from "../api/api-client"

export type RuleReplacePayload = Pick<
  RuleEntity,
  "name" | "brand" | "audience" | "campaign" | "channels" | "contentGuidelines"
>

export type RulePatchPayload = Partial<RuleReplacePayload>

export type ExtractRulePayload = FormData

export type ExtractRuleResponse = {
  ruleId: string
}

export type RulesPageablePayload = {
  page?: number
  limit?: number
  filter?: { name?: string; status?: string }
  sortBy?: "name" | "createdAt" | "updatedAt"
  sortOrder?: "asc" | "desc"
}

export type RulesPageableMeta = {
  total: number
  page: number
  limit: number
  totalPages: number
}

export type RuleListItem = {
  ruleId: string
  name: string
  status: string
  tones: string[]
  channels: string[]
  updatedAt: string
}

export type RulesPageableResponse<T = unknown> = {
  data: T[]
  meta: RulesPageableMeta
}

export const ruleService = {
  extract: async (payload: ExtractRulePayload): Promise<ExtractRuleResponse> => {
    const response = await apiClient.post("/rules/extract", payload)
    return response.data
  },
  getById: async <T = unknown>(ruleId: string): Promise<T> => {
    const response = await apiClient.get(`/rules/${ruleId}`)
    return response.data
  },
  pageable: async <T = unknown>(
    payload: RulesPageablePayload = {},
  ): Promise<RulesPageableResponse<T>> => {
    const response = await apiClient.post("/rules/pageable", payload)
    return response.data
  },
  patchRule: async (ruleId: string, patch: RulePatchPayload): Promise<RuleEntity> => {
    const response = await apiClient.patch(`/rules/${ruleId}`, patch)
    return response.data as RuleEntity
  },
  putRule: async (ruleId: string, body: RuleReplacePayload): Promise<RuleEntity> => {
    const response = await apiClient.put(`/rules/${ruleId}`, body)
    return response.data as RuleEntity
  },
}
