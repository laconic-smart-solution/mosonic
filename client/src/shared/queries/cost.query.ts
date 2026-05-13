import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { costService } from "@/shared/services/cost.service"
import { useAuthStore } from "@/shared/stores/auth.store"

export const costQueryKeys = {
  dashboard: (p: { from?: string; to?: string; campaignRef?: string }) =>
    ["cost", "dashboard", p] as const,
  monthly: ["cost", "monthly"] as const,
  budget: ["cost", "budget"] as const,
  pipeline: (id: string) => ["cost", "pipeline", id] as const,
}

export function useCostDashboardQuery(params?: {
  from?: string
  to?: string
  campaignRef?: string
}) {
  const token = useAuthStore((s) => s.accessToken)
  return useQuery({
    queryKey: costQueryKeys.dashboard(params ?? {}),
    queryFn: () => costService.getDashboard(params),
    enabled: !!token,
    staleTime: 0,
    refetchOnMount: "always",
    retry: false,
  })
}

export function useCostMonthlyQuery() {
  const token = useAuthStore((s) => s.accessToken)
  return useQuery({
    queryKey: costQueryKeys.monthly,
    queryFn: () => costService.getMonthly(),
    enabled: !!token,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
  })
}

export function useCostBudgetQuery() {
  const token = useAuthStore((s) => s.accessToken)
  return useQuery({
    queryKey: costQueryKeys.budget,
    queryFn: () => costService.getBudget(),
    enabled: !!token,
    retry: false,
  })
}

export function useCostPipelineQuery(pipelineId: string | undefined) {
  const token = useAuthStore((s) => s.accessToken)
  return useQuery({
    queryKey: costQueryKeys.pipeline(pipelineId ?? ""),
    queryFn: () => costService.getPipelineBreakdown(pipelineId!),
    enabled: !!token && !!pipelineId?.trim(),
    retry: false,
  })
}

export function useCostBudgetUpdateMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: costService.updateBudget,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["cost"] })
    },
  })
}
