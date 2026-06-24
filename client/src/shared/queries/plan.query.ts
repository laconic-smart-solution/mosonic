import { useQuery } from "@tanstack/react-query"

import { planService } from "@/shared/services/plan.service"

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
