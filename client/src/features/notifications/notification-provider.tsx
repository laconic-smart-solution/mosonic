import { useEffect } from "react"

import { upsertAnnouncementBanner } from "@/features/announcements/announcement-banner.store"
import type { AnnouncementLevel } from "@/features/announcements/api/announcements.api"
import {
  attachNotificationVisibilityListener,
  deliverNotification,
} from "@/features/notifications/notification-delivery"
import { useAuthStoreHydrated } from "@/shared/hooks/use-auth-store-hydrated"
import {
  ensureNotificationSocket,
  onNotification,
} from "@/shared/socket/notification-events"
import { disconnectSharedSocket } from "@/shared/socket/socket-client"
import { useAuthStore } from "@/shared/stores/auth.store"

export function NotificationProvider() {
  const hydrated = useAuthStoreHydrated()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  useEffect(() => {
    attachNotificationVisibilityListener()
  }, [])

  useEffect(() => {
    if (!hydrated || !isAuthenticated) {
      disconnectSharedSocket()
      return
    }

    ensureNotificationSocket()
    const cleanup = onNotification((payload) => {
      if (
        payload.sector === "admin" &&
        payload.type === "announcement.published"
      ) {
        const announcementId = payload.data?.announcementId
        if (typeof announcementId === "string" && announcementId) {
          const levelRaw = payload.data?.level
          const level: AnnouncementLevel =
            levelRaw === "warning" || levelRaw === "critical"
              ? levelRaw
              : "info"
          upsertAnnouncementBanner(
            {
              id: announcementId,
              title: payload.title,
              message: payload.message,
              level,
              publishedAt: payload.createdAt,
            },
            { forceShow: true },
          )
        }
      }
      deliverNotification(payload)
    })

    return () => {
      cleanup()
    }
  }, [hydrated, isAuthenticated])

  return null
}
