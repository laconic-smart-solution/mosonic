import { useEffect } from "react"

import {
  MOSONIC_READY,
  MOSONIC_RESTORE_SCROLL,
  MOSONIC_STATE,
  isEmbeddedInIframe,
} from "@/shared/lib/parent-frame-bridge"
import { router } from "@/app/routes/router"

const SCROLL_REPORT_THROTTLE_MS = 300

/**
 * Only active when embedded in the Competition Event app's iframe drawer.
 * Reports the current route + scroll position to the parent on every change
 * so it can remember where the user left off, and restores the parent's
 * saved scroll position once asked to.
 */
export function useParentFrameSync() {
  useEffect(() => {
    if (!isEmbeddedInIframe()) return

    const currentPath = () =>
      `${window.location.pathname}${window.location.search}`

    const reportState = () => {
      window.parent.postMessage(
        { type: MOSONIC_STATE, path: currentPath(), scrollY: window.scrollY },
        "*"
      )
    }

    window.parent.postMessage({ type: MOSONIC_READY }, "*")
    reportState()

    const unsubscribeRouter = router.subscribe(() => reportState())

    let scrollTimer: number | null = null
    const onScroll = () => {
      if (scrollTimer != null) return
      scrollTimer = window.setTimeout(() => {
        scrollTimer = null
        reportState()
      }, SCROLL_REPORT_THROTTLE_MS)
    }
    window.addEventListener("scroll", onScroll, { passive: true })

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent) return
      const data = event.data as { type?: string; scrollY?: number } | null
      if (data?.type === MOSONIC_RESTORE_SCROLL && typeof data.scrollY === "number") {
        requestAnimationFrame(() => window.scrollTo(0, data.scrollY as number))
      }
    }
    window.addEventListener("message", onMessage)

    return () => {
      unsubscribeRouter()
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("message", onMessage)
      if (scrollTimer != null) window.clearTimeout(scrollTimer)
    }
  }, [])
}
