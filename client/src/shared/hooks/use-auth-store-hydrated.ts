import { useEffect, useState } from "react"

import { useAuthStore } from "@/shared/stores/auth.store"

/** Wait for persisted access/refresh tokens to load before auth redirects. */
export function useAuthStoreHydrated(): boolean {
  const [hydrated, setHydrated] = useState(() =>
    typeof useAuthStore.persist?.hasHydrated === "function"
      ? useAuthStore.persist.hasHydrated()
      : true,
  )

  useEffect(() => {
    const unsub = useAuthStore.persist?.onFinishHydration?.(() =>
      setHydrated(true),
    )
    return () => {
      unsub?.()
    }
  }, [])

  return hydrated
}
