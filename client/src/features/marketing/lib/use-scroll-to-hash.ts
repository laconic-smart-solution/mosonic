import { useEffect } from "react"
import { useLocation } from "react-router-dom"

/** Smooth-scroll to the element matching `location.hash` (e.g. `/#about`). */
export function useScrollToHash() {
  const { pathname, hash } = useLocation()

  useEffect(() => {
    if (pathname !== "/" || !hash) return
    const id = hash.replace(/^#/, "")
    if (!id) return

    const frame = window.requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [pathname, hash])
}
