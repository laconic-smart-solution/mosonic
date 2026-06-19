import { appConfig } from "@/app/config/app-config"
import axios, {
  AxiosError,
  AxiosHeaders,
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
}

function authPathBypass(config: InternalAxiosRequestConfig | undefined): boolean {
  const url = config?.url ?? ""
  return (
    url.includes("/auth/login") ||
    url.includes("/auth/refresh") ||
    url.includes("/auth/signup") ||
    url.includes("/auth/resend-otp") ||
    url.includes("/auth/verify-otp") ||
    url.includes("/auth/change-password")
  )
}

let refreshInFlight: Promise<string | null> | null = null

async function refreshTokensAndPersist(): Promise<string | null> {
  refreshInFlight ??= (async () => {
    try {
      const refreshToken = useAuthStore.getState().refreshToken
      if (!refreshToken) return null
      const tokens = await authService.refreshWithRefreshToken(refreshToken)
      const role = useAuthStore.getState().role
      useAuthStore.getState().setSession({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        role: role ?? undefined,
      })
      return tokens.accessToken
    } catch {
      return null
    } finally {
      refreshInFlight = null
    }
  })()

  return refreshInFlight
}

function forceLogoutToLogin() {
  const { accessToken, refreshToken } = useAuthStore.getState()
  const hadSession = Boolean(accessToken || refreshToken)
  useUserStore.getState().clearUser()
  useAuthStore.getState().clearSession()
  if (!hadSession) {
    return
  }
  if (!window.location.pathname.startsWith("/login")) {
    window.location.href = "/login"
  }
}

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) {
    config.headers = config.headers ?? {}
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const status = error.response?.status
    const config = error.config as RetriableConfig | undefined

    if (status !== 401 || !config) {
      if (status === 401) {
        if (!authPathBypass(config)) {
          useUserStore.getState().clearUser()
          useAuthStore.getState().clearSession()
        }
      }
      return Promise.reject(error)
    }

    if (authPathBypass(config)) {
      useUserStore.getState().clearUser()
      useAuthStore.getState().clearSession()
      return Promise.reject(error)
    }

    if (config._retryAfterRefresh) {
      forceLogoutToLogin()
      return Promise.reject(error)
    }

    const newAccess = await refreshTokensAndPersist()
    if (!newAccess) {
      forceLogoutToLogin()
      return Promise.reject(error)
    }

    config._retryAfterRefresh = true
    const headers = AxiosHeaders.from(config.headers ?? {})
    headers.set("Authorization", `Bearer ${newAccess}`)
    config.headers = headers

    return apiClient.request(config)
  },
)

export default apiClient
