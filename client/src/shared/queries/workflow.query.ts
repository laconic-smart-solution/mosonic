import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
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
  })
}

export const useRegenerateWorkflowByRuleMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ ruleId, contentPrompt }: { ruleId: string; contentPrompt: string }) =>
      workflowService.regenerateByRule(ruleId, { contentPrompt }),
    onSuccess: (_data, { ruleId }) => {
      void queryClient.invalidateQueries({ queryKey: ["workflow", "rule", ruleId] })
      void queryClient.invalidateQueries({ queryKey: ["workflow", "pageable"] })
    },
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
      nodes,
    }: {
      workflowId: string
      ruleId?: string
      nodes: Parameters<typeof workflowService.saveNodes>[1]["nodes"]
    }) => workflowService.saveNodes(workflowId, { nodes }),
    onSuccess: (_, { workflowId, ruleId }) => {
      toast.success("Workflow saved")
      void queryClient.invalidateQueries({ queryKey: ["workflow", "pageable"] })
      if (ruleId) void queryClient.invalidateQueries({ queryKey: ["workflow", "rule", ruleId] })
      else void queryClient.invalidateQueries({ queryKey: ["workflow", workflowId] })
    },
    onError: () => {
      toast.error("Failed to save. Please try again.")
    },
  })
}
