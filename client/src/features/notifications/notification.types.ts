export type NotificationSector = "pipeline" | "workflow" | string

export type NotificationAction = {
  label: string
  href: string
}

export type AppNotificationPayload = {
  id: string
  sector: NotificationSector
  type: string
  title: string
  message: string
  createdAt: string
  data?: Record<string, unknown>
  action?: NotificationAction
}

export type NotificationItem = AppNotificationPayload & {
  read: boolean
}
