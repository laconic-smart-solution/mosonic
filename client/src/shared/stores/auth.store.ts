import { create } from "zustand"

import { useUserStore } from "@/shared/stores/user.store"

const LEGACY_AUTH_STORAGE_KEY = "neutral-tex-auth"

export type AuthState = {
  isAuthenticated: boolean
  isHydrated: boolean
  role: "ADMIN" | "CUSTOMER" | null
  /** `false` when SSO login reports email OTP is still required; `null` = unknown. */
  otpVerified: boolean | null
  pendingVerifyEmail: string | null
  hydrate: () => Promise<void>
  establishSession: (args?: {
    role?: AuthState["role"]
    otpVerified?: boolean | null
    pendingVerifyEmail?: string | null
  }) => void
  setPendingVerification: (email: string) => void
  setOtpVerified: (verified: boolean, email?: string | null) => void
  setRole: (role: AuthState["role"]) => void
  clearSession: () => void
  logout: () => Promise<void>
}

function clearLegacyTokenStorage() {
  try {
    localStorage.removeItem(LEGACY_AUTH_STORAGE_KEY)
  } catch {
    // ignore
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: false,
  isHydrated: false,
  role: null,
  otpVerified: null,
  pendingVerifyEmail: null,

  hydrate: async () => {
    clearLegacyTokenStorage()
    try {
      const { me } = await import("@/features/admin/api/auth-api")
      const { mapLocalUserToUser } = await import("@/shared/lib/map-local-user")
      const meResp = await me({ skipAuthRefresh: true })
      const lu = meResp?.auth?.localUser
      const role =
        lu?.role === "ADMIN" || lu?.role === "CUSTOMER" ? lu.role : null
      if (lu && typeof lu === "object") {
        useUserStore
          .getState()
          .setUser(
            mapLocalUserToUser(
              lu as Parameters<typeof mapLocalUserToUser>[0],
            ),
          )
      }
      set({
        isAuthenticated: true,
        isHydrated: true,
        role,
        otpVerified: true,
        pendingVerifyEmail: null,
      })
    } catch {
      const pending = get().pendingVerifyEmail
      set({
        isAuthenticated: false,
        isHydrated: true,
        role: null,
        otpVerified: pending ? false : null,
        pendingVerifyEmail: pending,
      })
      useUserStore.getState().clearUser()
    }
  },

  establishSession: (args) =>
    set((state) => ({
      isAuthenticated: true,
      isHydrated: true,
      role: args?.role !== undefined ? args.role : state.role,
      otpVerified: args?.otpVerified !== undefined ? args.otpVerified : true,
      pendingVerifyEmail:
        args?.pendingVerifyEmail !== undefined
          ? args.pendingVerifyEmail
          : null,
    })),

  setPendingVerification: (email) =>
    set({
      isAuthenticated: false,
      isHydrated: true,
      role: null,
      otpVerified: false,
      pendingVerifyEmail: email,
    }),

  setOtpVerified: (verified, email) =>
    set({
      otpVerified: verified,
      pendingVerifyEmail: verified ? null : (email ?? null),
    }),

  setRole: (role) => set({ role }),

  clearSession: () =>
    set({
      isAuthenticated: false,
      isHydrated: true,
      role: null,
      otpVerified: null,
      pendingVerifyEmail: null,
    }),

  logout: async () => {
    try {
      const { authService } = await import("@/shared/services/auth.service")
      await authService.logout()
    } catch {
      // Clear local state even when the server session is already gone.
    }
    get().clearSession()
    useUserStore.getState().clearUser()
  },
}))
