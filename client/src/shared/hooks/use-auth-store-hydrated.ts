import { useEffect, useState } from "react"

import { useAuthStore } from "@/shared/stores/auth.store"

let hydrateStarted = false

/**
 * Kick off cookie-session hydrate once, and report when auth state is ready
 * for route guards.
 */
export function useAuthStoreHydrated(): boolean {
  const isHydrated = useAuthStore((s) => s.isHydrated)
  const hydrate = useAuthStore((s) => s.hydrate)
  const [started, setStarted] = useState(hydrateStarted)

  useEffect(() => {
    if (hydrateStarted) {
      setStarted(true)
      return
    }
    hydrateStarted = true
    setStarted(true)
    void hydrate()
  }, [hydrate])

  return started && isHydrated
}
