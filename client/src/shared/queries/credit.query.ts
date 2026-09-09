import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { creditService } from "@/shared/services/credit.service"
import { toastApiError } from "@/shared/lib/toast-error"
import { useAuthStore } from "@/shared/stores/auth.store"
import type { TopupCreditsPayload } from "@/shared/types/credit.type"
import { usageQueryKeys } from "./usage.query"

export const creditQueryKeys = {
  packages: ["credit", "packages"] as const,
  generationCosts: ["credit", "generation-costs"] as const,
}

export function useCreditPackagesQuery(enabled = true) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return useQuery({
    queryKey: creditQueryKeys.packages,
    queryFn: () => creditService.getPackages(),
    enabled: enabled && isAuthenticated,
    staleTime: 5 * 60_000,
  })
}

export function useGenerationCreditCostsQuery(enabled = true) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return useQuery({
    queryKey: creditQueryKeys.generationCosts,
    queryFn: () => creditService.getGenerationCosts(),
    enabled: enabled && isAuthenticated,
    staleTime: 60_000,
  })
}

export function useCreditTopupMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: TopupCreditsPayload) => creditService.initiateTopup(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: usageQueryKeys.summary })
      void queryClient.invalidateQueries({ queryKey: ["pipeline", "estimate"] })
      void queryClient.invalidateQueries({ queryKey: ["pipeline", "review-estimate"] })
      void queryClient.invalidateQueries({ queryKey: creditQueryKeys.generationCosts })
    },
    onError: (err) => {
      toastApiError(err, "credit:topup.error")
    },
  })
}
