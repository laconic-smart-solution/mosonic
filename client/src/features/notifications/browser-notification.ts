import type { AppNotificationPayload } from "./notification.types"

const NOTIFICATION_ICON = "/vite.svg"

export type BrowserNotificationCapability =
  /** Desktop / Android Chrome — full Notification API in tabs */
  | "full"
  /** iOS/iPadOS installed to Home Screen — may receive alerts when app is in background */
  | "ios_pwa"
  /** iOS Safari/Chrome in a normal tab — use in-app bell + toasts only */
  | "ios_browser"
  | "unsupported"

export type BrowserNotificationPermissionState =
  | NotificationPermission
  | "unsupported"

function isAppleMobile(): boolean {
  if (typeof navigator === "undefined") return false
  const ua = navigator.userAgent
  if (/iPad|iPhone|iPod/i.test(ua)) return true
  // iPadOS 13+ desktop UA
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1
}

function isStandaloneDisplayMode(): boolean {
  if (typeof window === "undefined") return false
  const nav = navigator as Navigator & { standalone?: boolean }
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    nav.standalone === true
  )
}

function hasNotificationConstructor(): boolean {
  return typeof window !== "undefined" && "Notification" in window
}

/** Whether this browser can meaningfully use `window.Notification`. */
export function getBrowserNotificationCapability(): BrowserNotificationCapability {
  if (!hasNotificationConstructor()) return "unsupported"
  if (typeof Notification.requestPermission !== "function") {
    return "unsupported"
  }

  if (isAppleMobile()) {
    return isStandaloneDisplayMode() ? "ios_pwa" : "ios_browser"
  }

  return "full"
}

export function isBrowserNotificationSupported(): boolean {
  const cap = getBrowserNotificationCapability()
  return cap === "full" || cap === "ios_pwa"
}

export function canRequestBrowserNotificationPermission(): boolean {
  return isBrowserNotificationSupported()
}

export function canShowBrowserNotificationNow(): boolean {
  if (!isBrowserNotificationSupported()) return false
  return Notification.permission === "granted"
}

export function browserNotificationPermission(): BrowserNotificationPermissionState {
  if (!hasNotificationConstructor()) return "unsupported"
  return Notification.permission
}

export function browserNotificationStatusLabel(): string {
  const cap = getBrowserNotificationCapability()
  const perm = browserNotificationPermission()

  if (cap === "ios_browser") {
    return "On iPhone and iPad, add NeuralTex to your Home Screen to get background alerts. Until then, use the bell and in-app toasts."
  }
  if (cap === "unsupported") {
    return "This browser does not support background alerts. You will still see in-app notifications."
  }
  if (perm === "granted") {
    return cap === "ios_pwa"
      ? "Home Screen alerts are on."
      : "Browser alerts are on when this tab is in the background."
  }
  if (perm === "denied") {
    return "Browser alerts are blocked. Enable them in browser settings or use in-app notifications."
  }
  if (cap === "ios_pwa") {
    return "Turn on alerts for the installed app (Settings → Notifications)."
  }
  return "Enable alerts to get notified when a pipeline finishes while you are on another tab."
}

/**
 * Must be called from a user gesture (button click). iOS requires this.
 */
export async function requestBrowserNotificationPermission(): Promise<BrowserNotificationPermissionState> {
  if (!canRequestBrowserNotificationPermission()) {
    return "unsupported"
  }
  if (Notification.permission === "granted") return "granted"
  if (Notification.permission === "denied") return "denied"

  try {
    const result = await Notification.requestPermission()
    return result
  } catch {
    return Notification.permission
  }
}

/**
 * Shows a system notification when the tab is in the background.
 * Returns true if a notification was shown.
 */
export function showBrowserNotification(
  payload: AppNotificationPayload,
): boolean {
  if (!canShowBrowserNotificationNow()) return false
  if (typeof document !== "undefined" && !document.hidden) return false

  try {
    const n = new Notification(payload.title, {
      body: payload.message,
      tag: payload.id,
      icon: NOTIFICATION_ICON,
      silent: false,
    })
    n.onclick = () => {
      window.focus()
      n.close()
      if (payload.action?.href) {
        const path = payload.action.href.startsWith("/")
          ? payload.action.href
          : `/${payload.action.href}`
        window.location.href = path
      }
    }
    return true
  } catch {
    return false
  }
}
