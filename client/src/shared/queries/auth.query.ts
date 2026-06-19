import { useMutation, type QueryClient } from "@tanstack/react-query"

import { authService } from "../services/auth.service"
import { useAuthStore } from "../stores/auth.store"

/** Refetch active queries so post-login pages load the signed-in user's data. */
export async function refreshQueriesAfterLogin(
  queryClient: QueryClient,
): Promise<void> {
  await queryClient.invalidateQueries()
}

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
