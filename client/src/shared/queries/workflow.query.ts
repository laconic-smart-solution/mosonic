import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import i18n from "@/i18n"
import { toastApiError } from "@/shared/lib/toast-error"
import { workflowService } from "../services/workflow.service"
import type { GenerateWorkflowPayload, WorkflowPageQueryPayload } from "../types/workflow.type"

export const useWorkflowsPageQuery = (
  body: WorkflowPageQueryPayload,
  enabled = true,
) => {
  return useQuery({
    queryKey: ["workflow", "pageable", body],
    queryFn: () => workflowService.pageable(body),
    enabled,
    retry: false,
  })
}

export const useGenerateWorkflow = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: GenerateWorkflowPayload) =>
      workflowService.generateWorkflow(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workflow", "pageable"] })
    },
    meta: { silent: true },
  })
}

export const useRegenerateWorkflowByRuleMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      ruleId,
      answers,
    }: {
      ruleId: string
      answers: GenerateWorkflowPayload["answers"]
    }) => workflowService.regenerateByRule(ruleId, { answers }),
    onSuccess: (_data, { ruleId }) => {
      void queryClient.invalidateQueries({ queryKey: ["workflow", "rule", ruleId] })
      void queryClient.invalidateQueries({ queryKey: ["workflow", "pageable"] })
    },
    meta: { silent: true },
  })
}

export const useGetWorkflowByRuleIdQuery = (
  ruleId: string | undefined,
  options?: { refetchInterval?: number | false },
) => {
  return useQuery({
    queryKey: ["workflow", "rule", ruleId],
    queryFn: () => workflowService.getByRuleId(ruleId!),
    enabled: !!ruleId,
    retry: false,
    refetchInterval: options?.refetchInterval,
  })
}

export const useGetWorkflowQuery = (
  workflowId: string | undefined,
  options?: { refetchInterval?: number | false },
) => {
  return useQuery({
    queryKey: ["workflow", workflowId],
    queryFn: () => workflowService.getById(workflowId!),
    enabled: !!workflowId,
    refetchInterval: options?.refetchInterval,
  })
}

export const useSaveWorkflowNodesMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      workflowId,
      name,
      nodes,
      edges,
    }: {
      workflowId: string
      ruleId?: string
      name?: string
      nodes: Parameters<typeof workflowService.saveNodes>[1]["nodes"]
      edges?: Parameters<typeof workflowService.saveNodes>[1]["edges"]
    }) => workflowService.saveNodes(workflowId, { name, nodes, edges }),
    onSuccess: (_, { workflowId, ruleId }) => {
      toast.success(i18n.t("workflow:toast.saved"))
      void queryClient.invalidateQueries({ queryKey: ["workflow", "pageable"] })
      if (ruleId) void queryClient.invalidateQueries({ queryKey: ["workflow", "rule", ruleId] })
      else void queryClient.invalidateQueries({ queryKey: ["workflow", workflowId] })
    },
    onError: (err) => {
      toastApiError(err, "workflow:toast.saveFailed")
    },
  })
}

export const usePatchWorkflowMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      workflowId,
      name,
    }: {
      workflowId: string
      ruleId?: string
      name: string
    }) => workflowService.patchWorkflow(workflowId, { name }),
    onSuccess: (_data, { workflowId, ruleId }) => {
      toast.success(i18n.t("workflow:toast.nameUpdated"))
      void queryClient.invalidateQueries({ queryKey: ["workflow", "pageable"] })
      if (ruleId) {
        void queryClient.invalidateQueries({ queryKey: ["workflow", "rule", ruleId] })
      } else {
        void queryClient.invalidateQueries({ queryKey: ["workflow", workflowId] })
      }
    },
    onError: (err) => {
      toastApiError(err, "workflow:toast.nameUpdateFailed")
    },
  })
}

export const useSaveWorkflowNodesByRuleMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      ruleId,
      name,
      nodes,
      edges,
    }: {
      ruleId: string
      name?: string
      nodes: Parameters<typeof workflowService.saveNodesByRuleId>[1]["nodes"]
      edges?: Parameters<typeof workflowService.saveNodesByRuleId>[1]["edges"]
    }) => workflowService.saveNodesByRuleId(ruleId, { name, nodes, edges }),
    onSuccess: (_data, { ruleId }) => {
      toast.success(i18n.t("workflow:toast.saved"))
      void queryClient.invalidateQueries({ queryKey: ["workflow", "pageable"] })
      void queryClient.invalidateQueries({ queryKey: ["workflow", "rule", ruleId] })
    },
    onError: (err) => {
      toastApiError(err, "workflow:toast.saveFailed")
    },
  })
}

export const useApplyPipelineToWorkflowMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      ruleId,
      pipelineId,
    }: {
      ruleId: string
      pipelineId: string
    }) => workflowService.applyPipelineToWorkflow(ruleId, pipelineId),
    onSuccess: (_data, { ruleId }) => {
      void queryClient.invalidateQueries({ queryKey: ["workflow", "rule", ruleId] })
      void queryClient.invalidateQueries({ queryKey: ["workflow", "pageable"] })
    },
    meta: { toastNs: "workflow", toastKey: "usedPipelines.applyFailed", silent: true },
  })
}
