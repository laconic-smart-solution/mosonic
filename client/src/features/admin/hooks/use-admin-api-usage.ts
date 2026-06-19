import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { adminApi } from "../api/admin.api"
import type { ApiProviderId } from "../types/api-usage.types"

export const ADMIN_API_USAGE_QUERY_KEY = ["admin-api-usage"] as const

export const useAdminApiUsage = () =>
  useQuery({
    queryKey: ADMIN_API_USAGE_QUERY_KEY,
    queryFn: () => adminApi.getApiUsage(180),
    staleTime: 60_000,
  })

export const useAdminApiUsagePrepaidUpdate = (provider: ApiProviderId) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (prepaidCreditUsd: number) =>
      adminApi.updateApiUsagePrepaid(provider, prepaidCreditUsd),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ADMIN_API_USAGE_QUERY_KEY })
    },
  })
}
