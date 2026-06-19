import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

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
  const { t } = useTranslation("admin")
  const queryClient = useQueryClient()

  const invalidateUser = (userId: string) => {
    void queryClient.invalidateQueries({ queryKey: ["admin-users"] })
    void queryClient.invalidateQueries({ queryKey: ["admin-user", userId] })
  }

  const suspend = useMutation({
    mutationFn: adminApi.suspendUser,
    onSuccess: (_d, userId) => {
      invalidateUser(userId)
      toast.success(t("users.disableSuccess"))
    },
    onError: () => toast.error(t("users.disableError")),
  })

  const reactivate = useMutation({
    mutationFn: adminApi.reactivateUser,
    onSuccess: (_d, userId) => {
      invalidateUser(userId)
      toast.success(t("users.enableSuccess"))
    },
    onError: () => toast.error(t("users.enableError")),
  })

  const topup = useMutation({
    mutationFn: ({
      userId,
      credits,
      reason,
    }: {
      userId: string
      credits: number
      reason: string
    }) => adminApi.topupUserCredits(userId, { credits, reason }),
    onSuccess: (data, { userId, credits }) => {
      invalidateUser(userId)
      toast.success(
        t("users.topup.success", {
          credits: credits.toLocaleString(),
          remaining: data.creditsRemaining.toLocaleString(),
        }),
      )
    },
    onError: () => toast.error(t("users.topup.error")),
  })

  return { suspend, reactivate, topup }
}
