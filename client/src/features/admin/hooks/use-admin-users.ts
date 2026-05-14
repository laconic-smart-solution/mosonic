import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { adminApi } from "../api/admin.api"

export const useAdminUsers = (params: {
  page?: number
  limit?: number
  search?: string
  status?: string
}) =>
  useQuery({
    queryKey: ["admin-users", params],
    queryFn: () => adminApi.listUsers(params),
    staleTime: 30_000,
  })

export const useAdminUserDetail = (userId: string | undefined) =>
  useQuery({
    queryKey: ["admin-user", userId],
    queryFn: () => adminApi.getUserDetail(userId!),
    enabled: Boolean(userId),
    staleTime: 30_000,
  })

export const useAdminUserActions = () => {
  const queryClient = useQueryClient()

  const suspend = useMutation({
    mutationFn: adminApi.suspendUser,
    onSuccess: (_d, userId) => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] })
      void queryClient.invalidateQueries({ queryKey: ["admin-user", userId] })
    },
  })

  const reactivate = useMutation({
    mutationFn: adminApi.reactivateUser,
    onSuccess: (_d, userId) => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] })
      void queryClient.invalidateQueries({ queryKey: ["admin-user", userId] })
    },
  })

  return { suspend, reactivate }
}
