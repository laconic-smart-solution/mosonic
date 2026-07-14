import { useEffect } from "react"

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
      deliverNotification(payload)
    })

    return () => {
      cleanup()
    }
  }, [hydrated, isAuthenticated])

  return null
}
