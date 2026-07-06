import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { adminApi } from "../api/admin.api"

export type TopupPlan = {
  code: string
  label: string
  credits: number
  priceUsd: number
  priceThb: number
  sortOrder: number
  active: boolean
  createdAt: string
  updatedAt: string
}

export function useAdminTopupPlans() {
  return useQuery({
    queryKey: ["admin-topup-plans"],
    queryFn: () => adminApi.listTopupPlans() as Promise<TopupPlan[]>,
  })
}

export function useAdminTopupPlanCreate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: adminApi.createTopupPlan,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin-topup-plans"] }),
  })
}

export function useAdminTopupPlanUpdate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      code,
      body,
    }: {
      code: string
      body: {
        label: string
        credits: number
        priceUsd: number
        priceThb: number
        sortOrder: number
        active: boolean
      }
    }) => adminApi.updateTopupPlan(code, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin-topup-plans"] }),
  })
}

export function useAdminTopupPlanActive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ code, active }: { code: string; active: boolean }) =>
      adminApi.setTopupPlanActive(code, active),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin-topup-plans"] }),
  })
}
