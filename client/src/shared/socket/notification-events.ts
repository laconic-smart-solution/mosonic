import type { AppNotificationPayload } from "@/features/notifications/notification.types"

import { getSharedSocket } from "./socket-client"

export function onNotification(
  handler: (payload: AppNotificationPayload) => void,
): () => void {
  const socket = getSharedSocket()
  socket.on("notification", handler)
  return () => socket.off("notification", handler)
}

/** Ensures the shared socket is connected (user room join happens server-side on auth). */
export function ensureNotificationSocket(): void {
  getSharedSocket()
}
