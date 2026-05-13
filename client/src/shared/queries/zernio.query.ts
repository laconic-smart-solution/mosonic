import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { zernioService } from "../services/zernio.service"

export const useZernioAccountsQuery = (enabled = true) => {
  return useQuery({
    queryKey: ["zernio", "accounts"],
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
      void queryClient.invalidateQueries({ queryKey: ["zernio", "accounts"] })
    },
  })
}

export const useZernioConnectMutation = () => {
  return useMutation({
    mutationFn: (platform: string) => zernioService.getConnectUrl(platform),
  })
}

export const useDisconnectZernioAccountMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (channel: string) => zernioService.disconnectAccount(channel),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["zernio", "accounts"] })
    },
  })
}

