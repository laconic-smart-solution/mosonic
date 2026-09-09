import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toastApiError } from "@/shared/lib/toast-error"
import { zernioService } from "../services/zernio.service"

export const zernioQueryKeys = {
  accounts: ["zernio", "accounts"] as const,
}

export const useZernioAccountsQuery = (enabled = true) => {
  return useQuery({
    queryKey: zernioQueryKeys.accounts,
    queryFn: () => zernioService.getAccounts(),
    enabled,
    retry: false,
  })
}

export const useSyncZernioAccountsMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => zernioService.syncAccounts(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: zernioQueryKeys.accounts })
    },
    onError: (err) => {
      toastApiError(err, "settings:oauth.syncFailed")
    },
  })
}

export const useZernioConnectMutation = () => {
  return useMutation({
    mutationFn: (platform: string) => zernioService.connectChannel(platform),
  })
}

export const useDisconnectZernioAccountMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (channel: string) => zernioService.disconnectAccount(channel),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: zernioQueryKeys.accounts })
    },
    onError: (err) => {
      toastApiError(err, "settings:oauth.disconnectFailed")
    },
  })
}

