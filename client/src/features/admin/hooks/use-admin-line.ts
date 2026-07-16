import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { toastApiError } from "@/shared/lib/toast-error"

import { adminApi } from "../api/admin.api"

export type AdminLineConnection = {
  id: string
  userId: string
  lineUserId: string
  connectedAt: string
  email: string | null
  username: string | null
  firstName: string | null
  lastName: string | null
  displayName: string
}

export type AdminLineConnectionsResponse = {
  connections: AdminLineConnection[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export const adminLineQueryKeys = {
  connections: (params: { page?: number; limit?: number; search?: string }) =>
    ["admin-line-connections", params] as const,
}

export const useAdminLineConnections = (params: {
  page?: number
  limit?: number
  search?: string
}) =>
  useQuery({
    queryKey: adminLineQueryKeys.connections(params),
    queryFn: () =>
      adminApi.listLineConnections(params) as Promise<AdminLineConnectionsResponse>,
    staleTime: 15_000,
  })

export const useAdminSendLineMessage = () => {
  const { t } = useTranslation("admin")
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ userId, text }: { userId: string; text: string }) =>
      adminApi.sendLineMessage(userId, { text }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-line-connections"] })
      toast.success(t("communication.line.sendSuccess"))
    },
    onError: (err) => toastApiError(err, "admin:communication.line.sendError"),
  })
}
