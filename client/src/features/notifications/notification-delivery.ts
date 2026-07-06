import type { CSSProperties } from "react"
import { toast } from "sonner"

import {
  canShowBrowserNotificationNow,
  showBrowserNotification,
} from "./browser-notification"
import { useNotificationStore } from "./notification.store"
import type { AppNotificationPayload } from "./notification.types"

const pendingWhileHidden: AppNotificationPayload[] = []
const pendingIds = new Set<string>()

function pipelineIdFromPayload(payload: AppNotificationPayload): string | undefined {
  const id = payload.data?.pipelineId
  return typeof id === "string" ? id : undefined
}

/** Skip Sonner when workflow page already handles this pipeline live. */
function shouldSkipInAppToast(payload: AppNotificationPayload): boolean {
  if (
    payload.sector === "news" &&
    payload.type === "news.run_completed" &&
    typeof window !== "undefined" &&
    /^\/rules\/[^/]+\/news-trigger\/?$/.test(window.location.pathname)
  ) {
    return true
  }

  if (payload.sector !== "pipeline") return false
  const pipelineId = pipelineIdFromPayload(payload)
  if (!pipelineId) return false

  if (typeof window === "undefined") return false
  const path = window.location.pathname
  if (!path.startsWith("/workflow/")) return false

  const params = new URLSearchParams(window.location.search)
  return params.get("pipelineId") === pipelineId
}

function showInAppToast(payload: AppNotificationPayload): void {
  if (shouldSkipInAppToast(payload)) return

  const isSkippedNewsRun =
    payload.sector === "news" &&
    payload.type === "news.run_completed" &&
    payload.data?.outcome === "skipped"

  const isFailedNewsRun =
    payload.sector === "news" &&
    payload.type === "news.run_completed" &&
    payload.data?.status === "failed"

  if (isFailedNewsRun) {
    toast.error(payload.title, {
      id: `noti-${payload.id}`,
      description: payload.message,
      duration: 8000,
      style: { "--nt-duration": "8000ms" } as CSSProperties,
    })
    return
  }

  if (isSkippedNewsRun) {
    toast.warning(payload.title, {
      id: `noti-${payload.id}`,
      description: payload.message,
      duration: 8000,
      style: { "--nt-duration": "8000ms" } as CSSProperties,
    })
    return
  }

  if (payload.sector === "billing" && payload.type === "credit.refunded") {
    toast.success(payload.title, {
      id: `noti-${payload.id}`,
      description: payload.message,
      duration: 8000,
      style: { "--nt-duration": "8000ms" } as CSSProperties,
      action: payload.action
        ? {
            label: payload.action.label,
            onClick: () => {
              window.location.href = payload.action!.href.startsWith("/")
                ? payload.action!.href
                : `/${payload.action!.href}`
            },
          }
        : undefined,
    })
    return
  }

  toast(payload.title, {
    id: `noti-${payload.id}`,
    description: payload.message,
    duration: 6000,
    style: { "--nt-duration": "6000ms" } as CSSProperties,
    action: payload.action
      ? {
          label: payload.action.label,
          onClick: () => {
            window.location.href = payload.action!.href.startsWith("/")
              ? payload.action!.href
              : `/${payload.action!.href}`
          },
        }
      : undefined,
  })
}

function queuePending(payload: AppNotificationPayload): void {
  if (pendingIds.has(payload.id)) return
  pendingIds.add(payload.id)
  pendingWhileHidden.push(payload)
  if (pendingWhileHidden.length > 20) {
    const removed = pendingWhileHidden.shift()
    if (removed) pendingIds.delete(removed.id)
  }
}

/** Show toasts for notifications that arrived while the tab was hidden without system alerts. */
export function flushPendingInAppToasts(): void {
  if (typeof document === "undefined" || document.hidden) return
  if (pendingWhileHidden.length === 0) return

  const batch = pendingWhileHidden.splice(0, pendingWhileHidden.length)
  batch.forEach((p) => pendingIds.delete(p.id))

  for (const payload of batch) {
    showInAppToast(payload)
  }
}

export function deliverNotification(payload: AppNotificationPayload): void {
  const added = useNotificationStore.getState().push(payload)
  if (!added) return

  const hidden = typeof document !== "undefined" && document.hidden

  if (hidden) {
    const showedSystem = showBrowserNotification(payload)
    if (!showedSystem) {
      queuePending(payload)
    }
    return
  }

  if (canShowBrowserNotificationNow()) {
    showBrowserNotification(payload)
  }

  showInAppToast(payload)
}

let visibilityListenerAttached = false

/** Call once at app shell mount to deliver queued toasts when user returns to the tab. */
export function attachNotificationVisibilityListener(): void {
  if (visibilityListenerAttached || typeof document === "undefined") return
  visibilityListenerAttached = true

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      flushPendingInAppToasts()
    }
  })

  window.addEventListener("focus", () => {
    flushPendingInAppToasts()
  })
}
