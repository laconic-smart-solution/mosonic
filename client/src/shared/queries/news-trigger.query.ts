import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import {
  newsTriggerService,
  type NewsTriggerUpdatePayload,
} from "@/shared/services/news-trigger.service"
import { toastApiError } from "@/shared/lib/toast-error"

export function useNewsTriggerSettingsQuery(ruleId: string | undefined) {
  return useQuery({
    queryKey: ["news-trigger", ruleId],
    queryFn: () => newsTriggerService.getSettings(ruleId!),
    enabled: Boolean(ruleId),
  })
}

export function useLatestNewsRunQuery(ruleId: string | undefined) {
  return useQuery({
    queryKey: ["news-trigger-run-latest", ruleId],
    queryFn: () => newsTriggerService.getLatestRun(ruleId!),
    enabled: Boolean(ruleId),
  })
}

export function useUpdateNewsTriggerMutation(ruleId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: NewsTriggerUpdatePayload) =>
      newsTriggerService.updateSettings(ruleId, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["news-trigger", ruleId] })
    },
    onError: (err) => {
      toastApiError(err, "rules:toast.couldNotSaveNewsTrigger")
    },
  })
}

export function useTriggerNewsRunMutation(ruleId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => newsTriggerService.triggerRun(ruleId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["news-trigger", ruleId] })
      void qc.invalidateQueries({ queryKey: ["news-trigger-run-latest", ruleId] })
    },
    onError: (err) => {
      toastApiError(err, "rules:toast.newsRunFailed")
    },
  })
}
