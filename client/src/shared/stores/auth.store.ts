import { create } from "zustand"
import { persist } from "zustand/middleware"

export type AuthState = {
  accessToken: string | null
  refreshToken: string | null
  role: "ADMIN" | "CUSTOMER" | null
  setSession: (args: { accessToken: string; refreshToken: string; role?: AuthState["role"] }) => void
  clearSession: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      role: null,
      setSession: ({ accessToken, refreshToken, role }) =>
        set({ accessToken, refreshToken, role: role ?? null }),
      clearSession: () => set({ accessToken: null, refreshToken: null, role: null }),
    }),
    {
      name: "neutral-tex-auth",
      partialize: (s) => ({ accessToken: s.accessToken, refreshToken: s.refreshToken, role: s.role }),
    },
  ),
)

