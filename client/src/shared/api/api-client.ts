import { appConfig } from "@/app/config/app-config"
import axios from "axios"

import { useAuthStore } from "../stores/auth.store"
import { useUserStore } from "../stores/user.store"

const apiClient = axios.create({
  baseURL: appConfig.apiBaseUrl,
  withCredentials: true,
})

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
  (error) => {
    if (error.response?.status === 401) {
      useUserStore.getState().clearUser()
      useAuthStore.getState().clearSession()
    }
    return Promise.reject(error)
  },
)

export default apiClient
