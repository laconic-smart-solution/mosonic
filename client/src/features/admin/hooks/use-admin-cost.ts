import { useQuery } from "@tanstack/react-query"

import { adminApi } from "../api/admin.api"

export const useAdminCostSummary = (params?: { from?: string; to?: string }) =>
  useQuery({
    queryKey: ["admin-cost-summary", params],
    queryFn: () => adminApi.getCostSummary(params),
    staleTime: 60_000,
  })

export const useAdminMonthOverMonth = () =>
  useQuery({
    queryKey: ["admin-mom"],
    queryFn: () => adminApi.getMonthOverMonth(),
    staleTime: 60_000,
  })
