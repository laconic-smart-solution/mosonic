import { appConfig } from "@/app/config/app-config"
import axios, {
  AxiosError,
  type InternalAxiosRequestConfig,
} from "axios"

import { authService } from "../services/auth.service"
import { useAuthStore } from "../stores/auth.store"
import { useUserStore } from "../stores/user.store"

const apiClient = axios.create({
  baseURL: appConfig.apiBaseUrl,
  withCredentials: true,
})

type RetriableConfig = InternalAxiosRequestConfig & {
  _retryAfterRefresh?: boolean
  skipAuthRefresh?: boolean
}

function authPathBypass(config: InternalAxiosRequestConfig | undefined): boolean {
  const url = config?.url ?? ""
  return (
    url.includes("/auth/login") ||
    url.includes("/auth/refresh") ||
    url.includes("/auth/logout") ||
    url.includes("/auth/signup") ||
    url.includes("/auth/resend-otp") ||
    url.includes("/auth/verify-otp") ||
    url.includes("/auth/change-password")
  )
}

let refreshInFlight: Promise<boolean> | null = null

async function refreshSessionOnce(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      await authService.refresh()
      return true
    } catch {
      return false
    } finally {
      refreshInFlight = null
    }
  })()

  return refreshInFlight
}

async function forceLogoutToLogin() {
  const hadSession = useAuthStore.getState().isAuthenticated
  useUserStore.getState().clearUser()
  useAuthStore.getState().clearSession()
  try {
    await authService.logout()
  } catch {
    // Best-effort cookie clear.
  }
  if (!hadSession) {
    return
  }
  if (!window.location.pathname.startsWith("/login")) {
    window.location.href = "/login"
  }
}

function isAccountSuspendedError(error: AxiosError): boolean {
  if (error.response?.status !== 403) return false
  const data = error.response?.data as { error?: string } | undefined
  return data?.error === "AccountSuspended"
}

/** Banned users land on the dedicated suspended screen instead of the app. */
function redirectToSuspended() {
  if (!window.location.pathname.startsWith("/suspended")) {
    window.location.href = "/suspended"
  }
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const status = error.response?.status
    const config = error.config as RetriableConfig | undefined

    if (isAccountSuspendedError(error)) {
      redirectToSuspended()
      return Promise.reject(error)
    }

    if (status !== 401 || !config) {
      return Promise.reject(error)
    }

    if (config.skipAuthRefresh || authPathBypass(config)) {
      return Promise.reject(error)
    }

    if (config._retryAfterRefresh) {
      await forceLogoutToLogin()
      return Promise.reject(error)
    }

    const refreshed = await refreshSessionOnce()
    if (!refreshed) {
      await forceLogoutToLogin()
      return Promise.reject(error)
    }

    config._retryAfterRefresh = true
    return apiClient.request(config)
  },
)

export default apiClient
