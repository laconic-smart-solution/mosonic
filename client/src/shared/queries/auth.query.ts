import { useMutation } from "@tanstack/react-query"

import { authService } from "../services/auth.service"
import { useAuthStore } from "../stores/auth.store"

export function useRefreshMutation() {
  return useMutation({
    mutationFn: async () => {
      const refreshToken = useAuthStore.getState().refreshToken
      if (!refreshToken) {
        throw new Error("No refresh token")
      }
      return authService.refreshWithRefreshToken(refreshToken)
    },
  })
}
