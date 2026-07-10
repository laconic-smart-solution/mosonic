import type { ReactNode } from "react"
import { Navigate, Outlet, useLocation } from "react-router-dom"

import Loader from "@/components/core/loader"
import { useAuthStoreHydrated } from "@/shared/hooks/use-auth-store-hydrated"
import { needsEmailVerification, verifyOtpPath } from "@/shared/lib/auth-verification"
import { useAuthStore } from "@/shared/stores/auth.store"

/** Logged-in users skip guest-only pages (e.g. login). */
export function GuestOnlyRoute({ children }: { children: ReactNode }) {
  const hydrated = useAuthStoreHydrated()
  const location = useLocation()
  const accessToken = useAuthStore((s) => s.accessToken)
  const otpVerified = useAuthStore((s) => s.otpVerified)
  const pendingVerifyEmail = useAuthStore((s) => s.pendingVerifyEmail)

  if (!hydrated) {
    return <Loader />
  }

  if (accessToken) {
    if (needsEmailVerification(otpVerified)) {
      if (location.pathname.startsWith("/verify-otp")) {
        return <>{children}</>
      }
      return <Navigate to={verifyOtpPath(pendingVerifyEmail)} replace />
    }
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}

/** Requires Bearer session; renders nested routes via `<Outlet />`. */
export function ProtectedLayout() {
  const hydrated = useAuthStoreHydrated()
  const accessToken = useAuthStore((s) => s.accessToken)
  const otpVerified = useAuthStore((s) => s.otpVerified)
  const pendingVerifyEmail = useAuthStore((s) => s.pendingVerifyEmail)

  if (!hydrated) {
    return <Loader />
  }

  if (!accessToken) {
    return <Navigate to="/login" replace />
  }

  if (needsEmailVerification(otpVerified)) {
    return <Navigate to={verifyOtpPath(pendingVerifyEmail)} replace />
  }

  return <Outlet />
}

/** Requires ADMIN role (use inside already-protected layout). */
export function AdminRoute({ children }: { children: ReactNode }) {
  const accessToken = useAuthStore((s) => s.accessToken)
  const role = useAuthStore((s) => s.role)

  if (!accessToken) {
    return <Navigate to="/login" replace />
  }

  if (role !== "ADMIN") {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
