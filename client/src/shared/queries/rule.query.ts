import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import type { RuleEntity } from "@/features/rules/data/rules-mock"
import { toastApiError } from "@/shared/lib/toast-error"
import {
  ruleService,
  type ExtractRulePayload,
  type RuleListItem,
  type RulePatchPayload,
  type RuleReplacePayload,
  type RulesPageablePayload,
} from "../services/rule.service"

export function useCreateBlankRuleMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => ruleService.createBlank(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["rules", "pageable"] })
    },
    onError: (err) => {
      toastApiError(err, "home:welcome.createFailed")
    },
  })
}

export function useDeleteRuleMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (ruleId: string) => ruleService.deleteRule(ruleId),
    onSuccess: (_data, ruleId) => {
      void queryClient.invalidateQueries({ queryKey: ["rules", "pageable"] })
      void queryClient.removeQueries({ queryKey: ["rule", ruleId] })
    },
    onError: (err) => {
      toastApiError(err, "home:welcome.deleteFailed")
    },
  })
}

export function useExtractRuleMutation() {
  return useMutation({
    mutationFn: (payload: ExtractRulePayload) => ruleService.extract(payload),
    meta: { silent: true },
  })
}

export function useRuleByIdQuery<T = unknown>(ruleId?: string, enabled = true) {
  return useQuery({
    queryKey: ["rule", ruleId],
    queryFn: () => ruleService.getById<T>(ruleId as string),
    enabled: enabled && Boolean(ruleId),
    // Avoid reusing the same object reference when PATCH/PUT bodies match the cache;
    // otherwise React Flow keeps stale `internals.userNode` and skips adopting new labels.
    structuralSharing: false,
  })
}

export function useRulesPageQuery(body: RulesPageablePayload, enabled = true) {
  return useQuery({
    queryKey: ["rules", "pageable", body],
    queryFn: () => ruleService.pageable<RuleListItem>(body),
    enabled,
  })
}

export function usePatchRuleMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ ruleId, patch }: { ruleId: string; patch: RulePatchPayload }) =>
      ruleService.patchRule(ruleId, patch),
    onSuccess: (data, { ruleId }) => {
      queryClient.setQueryData<RuleEntity>(["rule", ruleId], { ...data })
      void queryClient.invalidateQueries({ queryKey: ["rules", "pageable"] })
    },
  })
}

export function usePutRuleMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ ruleId, body }: { ruleId: string; body: RuleReplacePayload }) =>
      ruleService.putRule(ruleId, body),
    onSuccess: (data, { ruleId }) => {
      queryClient.setQueryData<RuleEntity>(["rule", ruleId], { ...data })
      void queryClient.invalidateQueries({ queryKey: ["rules", "pageable"] })
    },
    onError: (err, { ruleId }) => {
      void queryClient.invalidateQueries({ queryKey: ["rule", ruleId] })
      toastApiError(err, "rules:toast.couldNotSaveRule")
    },
  })
}
