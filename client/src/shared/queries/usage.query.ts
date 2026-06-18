import { useQuery } from "@tanstack/react-query"

import { usageService } from "@/shared/services/usage.service"
import { useAuthStore } from "@/shared/stores/auth.store"

export const usageQueryKeys = {
  summary: ["usage", "summary"] as const,
  history: (p: { from?: string; to?: string; page?: number }) =>
    ["usage", "history", p] as const,
  currentPlan: ["usage", "current-plan"] as const,
}

export function useUsageSummaryQuery() {
  const token = useAuthStore((s) => s.accessToken)
  return useQuery({
    queryKey: usageQueryKeys.summary,
    queryFn: () => usageService.getSummary(),
    enabled: !!token,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}

export function useUsageHistoryQuery(params?: {
  from?: string
  to?: string
  page?: number
  limit?: number
}) {
  const token = useAuthStore((s) => s.accessToken)
  return useQuery({
    queryKey: usageQueryKeys.history(params ?? {}),
    queryFn: () => usageService.getHistory(params),
    enabled: !!token,
    staleTime: 30_000,
  })
}

export function useCurrentPlanQuery() {
  const token = useAuthStore((s) => s.accessToken)
  return useQuery({
    queryKey: usageQueryKeys.currentPlan,
    queryFn: () => usageService.getCurrentPlan(),
    enabled: !!token,
    staleTime: 30_000,
  })
}
