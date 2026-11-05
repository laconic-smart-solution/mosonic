import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { adminApi } from "../api/admin.api"

export const useAdminTokenRates = () =>
  useQuery({
    queryKey: ["admin-token-rates"],
    queryFn: () => adminApi.listTokenRates(),
    staleTime: 30_000,
    retry: (failureCount, error) => {
      const status = (error as { response?: { status?: number } })?.response
        ?.status
      if (status === 403 || status === 401) return false
      return failureCount < 2
    },
  })

export const useAdminTokenRateUpdate = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      model,
      provider,
      inputPerMToken,
      outputPerMToken,
      reasoningPerMToken,
    }: {
      model: string
      provider: string
      inputPerMToken: number
      outputPerMToken: number
      reasoningPerMToken?: number | null
    }) =>
      adminApi.updateTokenRate(model, {
        provider,
        inputPerMToken,
        outputPerMToken,
        reasoningPerMToken,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-token-rates"] })
    },
  })
}
