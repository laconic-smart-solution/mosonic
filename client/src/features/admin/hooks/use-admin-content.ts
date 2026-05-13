import { useQuery } from "@tanstack/react-query"

import { adminApi } from "../api/admin.api"

export const useAdminContent = (params: {
  page?: number
  limit?: number
  status?: string
  userId?: string
  from?: string
  to?: string
}) =>
  useQuery({
    queryKey: ["admin-content", params],
    queryFn: () => adminApi.listContent(params),
    staleTime: 30_000,
  })

export const useAdminContentDetail = (contentId: string | undefined) =>
  useQuery({
    queryKey: ["admin-content-detail", contentId],
    queryFn: () => adminApi.getContentDetail(contentId!),
    enabled: Boolean(contentId),
    staleTime: 30_000,
  })
