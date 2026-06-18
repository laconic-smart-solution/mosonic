import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { adminApi } from "../api/admin.api"

export const useAdminPlans = () =>
  useQuery({
    queryKey: ["admin-plans"],
    queryFn: () => adminApi.listPlans(),
    staleTime: 30_000,
  })

export const useAdminPlanUsers = (planId: string | undefined, page = 1) =>
  useQuery({
    queryKey: ["admin-plan-users", planId, page],
    queryFn: () => adminApi.getPlanUsers(planId!, { page, limit: 20 }),
    enabled: !!planId,
    staleTime: 30_000,
  })

export const useAdminPlanCreate = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: adminApi.createPlan,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin-plans"] }),
  })
}

export const useAdminPlanUpdate = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ planId, body }: { planId: string; body: Record<string, unknown> }) =>
      adminApi.updatePlan(planId, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin-plans"] }),
  })
}

export const useAdminPlanAssign = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ planId, userId }: { planId: string; userId: string }) =>
      adminApi.assignPlan(planId, userId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-plans"] })
      void qc.invalidateQueries({ queryKey: ["admin-plan-users"] })
    },
  })
}
