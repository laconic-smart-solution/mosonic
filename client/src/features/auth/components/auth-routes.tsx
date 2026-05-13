import type { ReactNode } from "react"
import {
  Navigate,
  Outlet,
  useLocation,
  useSearchParams,
} from "react-router-dom"

import PageLoader from "@/components/core/page-loader"
import { useAuthStoreHydrated } from "@/shared/hooks/use-auth-store-hydrated"
import { useAuthStore } from "@/shared/stores/auth.store"

/** Logged-in users skip guest-only pages (e.g. login). */
export function GuestOnlyRoute({ children }: { children: ReactNode }) {
  const hydrated = useAuthStoreHydrated()
  const accessToken = useAuthStore((s) => s.accessToken)
  const [searchParams] = useSearchParams()
  const next = searchParams.get("next")?.trim() || "/dashboard"

  if (!hydrated) {
    return <PageLoader />
  }

  if (accessToken) {
    return <Navigate to={next} replace />
  }

  return <>{children}</>
}

/** Requires Bearer session; renders nested routes via `<Outlet />`. */
export function ProtectedLayout() {
  const hydrated = useAuthStoreHydrated()
  const accessToken = useAuthStore((s) => s.accessToken)
  const location = useLocation()

  if (!hydrated) {
    return <PageLoader />
  }

  if (!accessToken) {
    return (
      <Navigate
        to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}
        replace
        state={{ from: location.pathname }}
      />
    )
  }

  return <Outlet />
}

/** Requires ADMIN role (use inside already-protected layout). */
export function AdminRoute({ children }: { children: ReactNode }) {
  const accessToken = useAuthStore((s) => s.accessToken)
  const role = useAuthStore((s) => s.role)

  if (!accessToken) {
    return <Navigate to="/login?next=/admin" replace />
  }

  if (role !== "ADMIN") {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
