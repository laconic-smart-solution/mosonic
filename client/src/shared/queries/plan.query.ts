import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { planService } from "@/shared/services/plan.service"
import { usageQueryKeys } from "@/shared/queries/usage.query"

export const planQueryKeys = {
  public: ["plans", "public"] as const,
}

export function usePublicPlansQuery() {
  return useQuery({
    queryKey: planQueryKeys.public,
    queryFn: () => planService.listPublicPlans(),
    staleTime: 5 * 60_000,
  })
}

export function usePlanUpgradeMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (planId: string) => planService.initiatePlanUpgrade(planId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: usageQueryKeys.summary })
      void queryClient.invalidateQueries({ queryKey: usageQueryKeys.currentPlan })
      void queryClient.invalidateQueries({ queryKey: planQueryKeys.public })
      void queryClient.invalidateQueries({ queryKey: ["usage", "history"] })
    },
  })
}
