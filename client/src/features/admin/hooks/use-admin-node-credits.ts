import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { adminApi } from "../api/admin.api"

export const useAdminNodeCredits = () =>
  useQuery({
    queryKey: ["admin-node-credits"],
    queryFn: () => adminApi.listNodeCredits(),
    staleTime: 30_000,
    retry: (failureCount, error) => {
      const status = (error as { response?: { status?: number } })?.response
        ?.status
      if (status === 403 || status === 401) return false
      return failureCount < 2
    },
  })

export const useAdminNodeCreditUpdate = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      nodeType,
      costUsd,
    }: {
      nodeType: string
      costUsd: number
    }) => adminApi.updateNodeCredit(nodeType, { costUsd }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-node-credits"] })
    },
  })
}
