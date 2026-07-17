import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { toastApiError } from "@/shared/lib/toast-error"

import { adminApi } from "../api/admin.api"

export type AnnouncementLevel = "info" | "warning" | "critical"

export type AdminAnnouncement = {
  id: string
  title: string
  message: string
  level: AnnouncementLevel
  status: "published" | "failed"
  sendInApp: boolean
  sendLine: boolean
  createdBy: string
  publishedAt: string
  inAppRecipientCount: number
  lineTotal: number | null
  lineSent: number | null
  lineFailed: number | null
  lineFailedIds: string[]
  createdAt: string
}

export type AdminAnnouncementsResponse = {
  announcements: AdminAnnouncement[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export type PublishAnnouncementBody = {
  title: string
  message: string
  level: AnnouncementLevel
  sendInApp: boolean
  sendLine: boolean
}

export const adminAnnouncementQueryKeys = {
  list: (params: { page?: number; limit?: number }) =>
    ["admin-announcements", params] as const,
}

export const useAdminAnnouncements = (params: {
  page?: number
  limit?: number
}) =>
  useQuery({
    queryKey: adminAnnouncementQueryKeys.list(params),
    queryFn: () =>
      adminApi.listAnnouncements(params) as Promise<AdminAnnouncementsResponse>,
    staleTime: 15_000,
  })

export const useAdminPublishAnnouncement = () => {
  const { t } = useTranslation("admin")
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: PublishAnnouncementBody) =>
      adminApi.publishAnnouncement(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-announcements"] })
      toast.success(t("communication.announcements.publishSuccess"))
    },
    onError: (err) =>
      toastApiError(err, "admin:communication.announcements.publishError"),
  })
}
