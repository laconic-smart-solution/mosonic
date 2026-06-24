import { MutationCache, QueryClient } from "@tanstack/react-query"

import { toastMutationError } from "@/shared/lib/toast-error"

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
      },
    },
    mutationCache: new MutationCache({
      onError: (err, _vars, _ctx, mutation) => {
        const meta = mutation.meta as
          | { toastKey?: string; toastNs?: string; silent?: boolean }
          | undefined
        if (meta?.silent || !meta?.toastKey) return
        if (meta.toastNs) {
          toastMutationError(err, meta.toastNs, meta.toastKey)
        }
      },
    }),
  })
}
