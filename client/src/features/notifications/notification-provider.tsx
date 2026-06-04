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
  const accessToken = useAuthStore((s) => s.accessToken)

  useEffect(() => {
    attachNotificationVisibilityListener()
  }, [])

  useEffect(() => {
    if (!hydrated || !accessToken) {
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
  }, [hydrated, accessToken])

  return null
}
