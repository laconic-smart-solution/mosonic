import { create } from "zustand"
import { persist } from "zustand/middleware"

export type AuthState = {
  accessToken: string | null
  refreshToken: string | null
  role: "ADMIN" | "CUSTOMER" | null
  /** `false` when SSO login reports email OTP is still required; `null` = unknown (legacy). */
  otpVerified: boolean | null
  pendingVerifyEmail: string | null
  setSession: (args: {
    accessToken: string
    refreshToken: string
    role?: AuthState["role"]
    otpVerified?: boolean | null
    pendingVerifyEmail?: string | null
  }) => void
  setOtpVerified: (verified: boolean, email?: string | null) => void
  clearSession: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      role: null,
      otpVerified: null,
      pendingVerifyEmail: null,
      setSession: ({
        accessToken,
        refreshToken,
        role,
        otpVerified,
        pendingVerifyEmail,
      }) =>
        set((state) => ({
          accessToken,
          refreshToken,
          role: role !== undefined ? (role ?? null) : state.role,
          otpVerified:
            otpVerified !== undefined ? otpVerified : state.otpVerified,
          pendingVerifyEmail:
            pendingVerifyEmail !== undefined
              ? pendingVerifyEmail
              : state.pendingVerifyEmail,
        })),
      setOtpVerified: (verified, email) =>
        set({
          otpVerified: verified,
          pendingVerifyEmail: verified ? null : (email ?? null),
        }),
      clearSession: () =>
        set({
          accessToken: null,
          refreshToken: null,
          role: null,
          otpVerified: null,
          pendingVerifyEmail: null,
        }),
    }),
    {
      name: "neutral-tex-auth",
      partialize: (s) => ({
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        role: s.role,
        otpVerified: s.otpVerified,
        pendingVerifyEmail: s.pendingVerifyEmail,
      }),
    },
  ),
)
