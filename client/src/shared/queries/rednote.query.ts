import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toastApiError } from "@/shared/lib/toast-error"
import { rednoteService } from "../services/rednote.service"
import { usageQueryKeys } from "./usage.query"
import { zernioQueryKeys } from "./zernio.query"

export const rednoteQueryKeys = {
  account: ["rednote", "account"] as const,
}

export const useRedNoteAccountQuery = (enabled = true) => {
  return useQuery({
    queryKey: rednoteQueryKeys.account,
    queryFn: () => rednoteService.getAccount(),
    enabled,
    retry: false,
  })
}

export const useRedNoteUnlockMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => rednoteService.unlock(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: rednoteQueryKeys.account })
      void queryClient.invalidateQueries({ queryKey: zernioQueryKeys.accounts })
      void queryClient.invalidateQueries({
        queryKey: zernioQueryKeys.connectionCredit,
      })
      void queryClient.invalidateQueries({ queryKey: usageQueryKeys.summary })
    },
  })
}

export const useRedNoteConnectMutation = () => {
  return useMutation({
    mutationFn: () => rednoteService.connect(),
  })
}

export const useRedNoteCancelConnectMutation = () => {
  return useMutation({
    mutationFn: () => rednoteService.cancelConnect(),
  })
}

export const useRedNoteDisconnectMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => rednoteService.disconnect(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: rednoteQueryKeys.account })
      void queryClient.invalidateQueries({ queryKey: zernioQueryKeys.accounts })
    },
    onError: (err) => {
      toastApiError(err, "settings:oauth.disconnectFailed")
    },
  })
}

export const useRedNoteHealthCheckMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => rednoteService.healthCheck(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: rednoteQueryKeys.account })
      void queryClient.invalidateQueries({ queryKey: zernioQueryKeys.accounts })
    },
  })
}
