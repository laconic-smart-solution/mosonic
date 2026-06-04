import { useQuery } from "@tanstack/react-query"
import { useAuthStore } from "@/shared/stores/auth.store"
import { dashboardService } from "@/shared/services/dashboard.service"

export const dashboardQueryKeys = {
  get: ["dashboard"] as const,
}

export function useDashboardQuery() {
  const token = useAuthStore((s) => s.accessToken)
  return useQuery({
    queryKey: dashboardQueryKeys.get,
    queryFn: () => dashboardService.get(),
    enabled: !!token,
    staleTime: 30_000,
    refetchInterval: 120_000,
    retry: false,
  })
}

