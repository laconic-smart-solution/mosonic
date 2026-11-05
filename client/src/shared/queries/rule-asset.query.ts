import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { toastApiError } from "@/shared/lib/toast-error"
import {
  ruleAssetService,
  type RuleAsset,
  type RuleAssetType,
} from "../services/rule-asset.service"

export function useRuleAssetsQuery(ruleId?: string) {
  return useQuery({
    queryKey: ["rule-assets", ruleId],
    queryFn: () => ruleAssetService.list(ruleId as string),
    enabled: Boolean(ruleId),
    refetchInterval: (query) => {
      const assets = query.state.data as RuleAsset[] | undefined
      const stillProcessing = assets?.some(
        (asset) => asset.status === "pending" || asset.status === "processing",
      )
      return stillProcessing ? 3000 : false
    },
  })
}

export function useUploadRuleAssetMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      ruleId,
      file,
      type,
    }: {
      ruleId: string
      file: File
      type: RuleAssetType
    }) => ruleAssetService.upload(ruleId, file, type),
    onSuccess: (_data, { ruleId }) => {
      void queryClient.invalidateQueries({ queryKey: ["rule-assets", ruleId] })
    },
    onError: (err) => {
      toastApiError(err, "rules:assets.toast.uploadFailed")
    },
  })
}

export function useDeleteRuleAssetMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      ruleId,
      ruleAssetId,
    }: {
      ruleId: string
      ruleAssetId: string
    }) => ruleAssetService.remove(ruleId, ruleAssetId),
    onSuccess: (_data, { ruleId }) => {
      void queryClient.invalidateQueries({ queryKey: ["rule-assets", ruleId] })
    },
    onError: (err) => {
      toastApiError(err, "rules:assets.toast.deleteFailed")
    },
  })
}
