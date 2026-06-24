import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { adminApi } from "../api/admin.api"

export const useAdminCreditConfig = () =>
  useQuery({
    queryKey: ["admin-credit-config"],
    queryFn: () => adminApi.getCreditConfig(),
    staleTime: 30_000,
  })

export const useAdminCreditHistory = (page = 1) =>
  useQuery({
    queryKey: ["admin-credit-history", page],
    queryFn: () => adminApi.getCreditConfigHistory({ page, limit: 20 }),
    staleTime: 60_000,
  })

export const useAdminFixedCosts = () =>
  useQuery({
    queryKey: ["admin-fixed-costs"],
    queryFn: () => adminApi.listFixedCosts(),
    staleTime: 30_000,
  })

export const useAdminServiceRates = () =>
  useQuery({
    queryKey: ["admin-service-rates"],
    queryFn: () => adminApi.listServiceRates(),
    staleTime: 30_000,
  })

export const useAdminCreditConfigUpdate = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: adminApi.updateCreditConfig,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-credit-config"] })
      void qc.invalidateQueries({ queryKey: ["admin-credit-history"] })
      void qc.invalidateQueries({ queryKey: ["admin-plans"] })
    },
  })
}

export const useAdminCreditRecalculate = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => adminApi.recalculateCreditOverhead(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-credit-config"] })
    },
  })
}

export const useAdminFixedCostMutations = () => {
  const qc = useQueryClient()
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["admin-fixed-costs"] })
    void qc.invalidateQueries({ queryKey: ["admin-credit-config"] })
  }
  return {
    create: useMutation({
      mutationFn: adminApi.createFixedCost,
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({
        id,
        body,
      }: {
        id: string
        body: { name?: string; amountUsd?: number; isActive?: boolean }
      }) => adminApi.updateFixedCost(id, body),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => adminApi.deleteFixedCost(id),
      onSuccess: invalidate,
    }),
  }
}

export const useAdminCreditPreview = () =>
  useMutation({
    mutationFn: adminApi.previewCreditWorkflow,
  })
