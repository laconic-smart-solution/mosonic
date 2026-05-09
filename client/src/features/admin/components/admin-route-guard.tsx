import type { ReactNode } from "react"
import { Navigate, useLocation } from "react-router-dom"

import { useAuthStore } from "@/shared/stores/auth.store"

export default function AdminRouteGuard({ children }: { children: ReactNode }) {
  const { accessToken, role } = useAuthStore()
  const location = useLocation()

  if (!accessToken) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />
  }

  if (role !== "ADMIN") {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}

