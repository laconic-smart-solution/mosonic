import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useAuthStore } from "@/shared/stores/auth.store"
import { analyticsService } from "@/shared/services/analytics.service"
import type { AnalyticsLatestResponse, AnalyticsSnapshot } from "@/shared/types/analytics.type"

export const analyticsQueryKeys = {
  summary: ["analytics", "summary"] as const,
  list: (p: { page: number; limit: number; ruleId?: string }) =>
    ["analytics", "list", p] as const,
  latest: (ruleId: string) => ["analytics", "latest", ruleId] as const,
}

export function useAnalyticsPendingSummary() {
  const token = useAuthStore((s) => s.accessToken)
  return useQuery({
    queryKey: analyticsQueryKeys.summary,
    queryFn: async () => {
      const res = await analyticsService.list({ page: 1, limit: 1 })
      return res.totalPendingSuggestions
    },
    enabled: !!token,
    staleTime: 30_000,
    refetchInterval: 120_000,
    retry: false,
  })
}

export function useAnalyticsListQuery(params: { page?: number; limit?: number; ruleId?: string }) {
  const token = useAuthStore((s) => s.accessToken)
  const page = params.page ?? 1
  const limit = params.limit ?? 10
  return useQuery({
    queryKey: analyticsQueryKeys.list({ page, limit, ruleId: params.ruleId }),
    queryFn: () => analyticsService.list({ page, limit, ruleId: params.ruleId }),
    enabled: !!token,
    retry: false,
  })
}

export function useAnalyticsLatestQuery(ruleId: string | undefined) {
  const token = useAuthStore((s) => s.accessToken)
  return useQuery({
    queryKey: analyticsQueryKeys.latest(ruleId ?? ""),
    queryFn: () => analyticsService.latest(ruleId!),
    enabled: !!token && !!ruleId,
    retry: false,
  })
}

export function useAnalyticsPullMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ruleId: string) => analyticsService.pull(ruleId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["analytics"] })
    },
  })
}

export function useAnalyticsGenerateSuggestionsMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (analyticsId: string) => analyticsService.generateSuggestions(analyticsId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["analytics"] })
    },
  })
}

export function useAnalyticsApplyMutation(analyticsId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (index: number) => analyticsService.applySuggestion(analyticsId!, index),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["analytics"] })
    },
  })
}

export function useAnalyticsRejectMutation(analyticsId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (index: number) => analyticsService.rejectSuggestion(analyticsId!, index),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["analytics"] })
    },
  })
}

export function setAnalyticsLatestCache(
  qc: ReturnType<typeof useQueryClient>,
  ruleId: string,
  snapshot: AnalyticsSnapshot | null,
) {
  qc.setQueryData<AnalyticsLatestResponse>(analyticsQueryKeys.latest(ruleId), (prev) => ({
    ruleName: prev?.ruleName ?? "Rule",
    analytics: snapshot,
    display: prev?.display ?? { contentByRef: {}, uploadByRef: {} },
  }))
}
