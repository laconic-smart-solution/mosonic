import { useEffect } from "react"

import { me } from "@/features/admin/api/auth-api"
import { useAuthStoreHydrated } from "@/shared/hooks/use-auth-store-hydrated"
import { mapLocalUserToUser } from "@/shared/lib/map-local-user"
import { parseApiError } from "@/shared/lib/api-error"
import { useAuthStore } from "@/shared/stores/auth.store"
import { useUserStore } from "@/shared/stores/user.store"

/** Load `/auth/me` into user store when we have a cookie session but no cached profile. */
export function useSessionBootstrap() {
  const hydrated = useAuthStoreHydrated()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const user = useUserStore((s) => s.user)

  useEffect(() => {
    if (!hydrated || !isAuthenticated || user) {
      return
    }

    let cancelled = false

    void (async () => {
      try {
        const meResp = await me()
        const lu = meResp?.auth?.localUser
        if (cancelled || !lu || typeof lu !== "object") {
          return
        }
        const role = lu.role
        if (role === "ADMIN" || role === "CUSTOMER") {
          useAuthStore.getState().setRole(role)
        }
        useUserStore
          .getState()
          .setUser(mapLocalUserToUser(lu as Parameters<typeof mapLocalUserToUser>[0]))
      } catch (err) {
        const { status } = parseApiError(err)
        if (status === 401) {
          useUserStore.getState().clearUser()
          useAuthStore.getState().clearSession()
          if (!window.location.pathname.startsWith("/login")) {
            window.location.href = "/login"
          }
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [hydrated, isAuthenticated, user])
}
