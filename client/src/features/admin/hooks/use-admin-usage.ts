import { useQuery } from "@tanstack/react-query"

import { adminApi } from "../api/admin.api"

export const useAdminUsageSummary = (params?: {
  from?: string
  to?: string
  userId?: string
}) =>
  useQuery({
    queryKey: ["admin-usage-summary", params],
    queryFn: () => adminApi.getUsageSummary(params),
    staleTime: 60_000,
  })

export const useAdminUsageHistory = (params: {
  from?: string
  to?: string
  userId?: string
  nodeType?: string
  provider?: string
  page?: number
  limit?: number
}) =>
  useQuery({
    queryKey: ["admin-usage-history", params],
    queryFn: () => adminApi.getUsageHistory(params),
    staleTime: 30_000,
  })
