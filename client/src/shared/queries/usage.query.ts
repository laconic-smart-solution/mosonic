import { useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import { usageService } from "@/shared/services/usage.service"
import { onCreditBalanceUpdated, onPlanUpdated } from "@/shared/socket/credit-events"
import { useAuthStore } from "@/shared/stores/auth.store"
import { zernioQueryKeys } from "./zernio.query"

export const usageQueryKeys = {
  summary: ["usage", "summary"] as const,
  history: (p: { from?: string; to?: string; page?: number }) =>
    ["usage", "history", p] as const,
  currentPlan: ["usage", "current-plan"] as const,
}

export function useCreditBalanceSocketRefresh() {
  const queryClient = useQueryClient()
  useEffect(() => {
    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: usageQueryKeys.summary })
      void queryClient.invalidateQueries({ queryKey: usageQueryKeys.currentPlan })
      void queryClient.invalidateQueries({ queryKey: ["usage", "history"] })
      void queryClient.invalidateQueries({ queryKey: ["content"] })
      void queryClient.invalidateQueries({ queryKey: ["pipeline", "estimate"] })
      void queryClient.invalidateQueries({ queryKey: zernioQueryKeys.connectionCredit })
      void queryClient.invalidateQueries({ queryKey: ["plans", "public"] })
    }
    const offBalance = onCreditBalanceUpdated(invalidate)
    const offPlan = onPlanUpdated(invalidate)
    return () => {
      offBalance()
      offPlan()
    }
  }, [queryClient])
}

export function useUsageSummaryQuery() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return useQuery({
    queryKey: usageQueryKeys.summary,
    queryFn: () => usageService.getSummary(),
    enabled: isAuthenticated,
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
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return useQuery({
    queryKey: usageQueryKeys.history(params ?? {}),
    queryFn: () => usageService.getHistory(params),
    enabled: isAuthenticated,
    staleTime: 30_000,
  })
}

export function useCurrentPlanQuery() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return useQuery({
    queryKey: usageQueryKeys.currentPlan,
    queryFn: () => usageService.getCurrentPlan(),
    enabled: isAuthenticated,
    staleTime: 30_000,
  })
}
