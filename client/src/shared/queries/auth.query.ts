import { useMutation, type QueryClient } from "@tanstack/react-query"

import { authService } from "../services/auth.service"

/** Refetch active queries so post-login pages load the signed-in user's data. */
export async function refreshQueriesAfterLogin(
  queryClient: QueryClient,
): Promise<void> {
  await queryClient.invalidateQueries()
}

export function useRefreshMutation() {
  return useMutation({
    mutationFn: async () => {
      await authService.refresh()
    },
  })
}
