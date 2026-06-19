import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { adminApi } from "../api/admin.api"
import { ADMIN_API_USAGE_QUERY_KEY } from "./use-admin-api-usage"

export const useAdminOpenAiBilling = () =>
  useQuery({
    queryKey: ["admin-openai-billing"],
    queryFn: async () => {
      const data = await adminApi.getApiUsage(180)
      return data.openai
    },
    staleTime: 60_000,
  })

export const useAdminOpenAiPrepaidUpdate = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (prepaidCreditUsd: number) =>
      adminApi.updateApiUsagePrepaid("openai", prepaidCreditUsd),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-openai-billing"] })
      void qc.invalidateQueries({ queryKey: ADMIN_API_USAGE_QUERY_KEY })
    },
  })
}
