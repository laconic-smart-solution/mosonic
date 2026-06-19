import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { zernioService } from "../services/zernio.service"
import { usageQueryKeys } from "./usage.query"

export const zernioQueryKeys = {
  accounts: ["zernio", "accounts"] as const,
  connectionCredit: ["zernio", "connection-credit"] as const,
}

export const useZernioAccountsQuery = (enabled = true) => {
  return useQuery({
    queryKey: zernioQueryKeys.accounts,
    queryFn: () => zernioService.getAccounts(),
    enabled,
    retry: false,
  })
}

export const useZernioConnectionCreditQuery = (enabled = true) => {
  return useQuery({
    queryKey: zernioQueryKeys.connectionCredit,
    queryFn: () => zernioService.getConnectionCredit(),
    enabled,
    retry: false,
    staleTime: 30_000,
  })
}

export const useSyncZernioAccountsMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => zernioService.syncAccounts(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: zernioQueryKeys.accounts })
    },
  })
}

export const useZernioUnlockMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (platform: string) => zernioService.unlockChannel(platform),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: zernioQueryKeys.accounts })
      void queryClient.invalidateQueries({ queryKey: zernioQueryKeys.connectionCredit })
      void queryClient.invalidateQueries({ queryKey: usageQueryKeys.summary })
      void queryClient.invalidateQueries({ queryKey: ["usage", "history"] })
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
  })
}

