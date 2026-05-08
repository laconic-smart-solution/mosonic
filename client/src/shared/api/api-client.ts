import { appConfig } from "@/app/config/app-config"
import axios from "axios"

import { useUserStore } from "../stores/user.store"

const apiClient = axios.create({
  baseURL: appConfig.apiBaseUrl,
  withCredentials: true,
})

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useUserStore.getState().clearUser()
    }
    return Promise.reject(error)
  },
)

export default apiClient
