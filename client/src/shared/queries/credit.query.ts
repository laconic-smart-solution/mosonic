import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { creditService } from "@/shared/services/credit.service"
import { useAuthStore } from "@/shared/stores/auth.store"
import type { TopupCreditsPayload } from "@/shared/types/credit.type"
import { usageQueryKeys } from "./usage.query"
import { zernioQueryKeys } from "./zernio.query"

export const creditQueryKeys = {
  packages: ["credit", "packages"] as const,
}

export function useCreditPackagesQuery(enabled = true) {
  const token = useAuthStore((s) => s.accessToken)
  return useQuery({
    queryKey: creditQueryKeys.packages,
    queryFn: () => creditService.getPackages(),
    enabled: enabled && !!token,
    staleTime: 5 * 60_000,
  })
}

export function useCreditTopupMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: TopupCreditsPayload) => creditService.initiateTopup(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: usageQueryKeys.summary })
      void queryClient.invalidateQueries({ queryKey: ["pipeline", "estimate"] })
      void queryClient.invalidateQueries({ queryKey: zernioQueryKeys.connectionCredit })
    },
  })
}
