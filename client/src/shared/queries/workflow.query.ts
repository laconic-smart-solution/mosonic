import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { workflowService } from "../services/workflow.service"
import type { GenerateWorkflowPayload } from "../types/workflow.type"

export const useGenerateWorkflow = () => {
  return useMutation({
    mutationFn: (payload: GenerateWorkflowPayload) =>
      workflowService.generateWorkflow(payload),
  })
}

export const useRegenerateWorkflowByRuleMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ ruleId, contentPrompt }: { ruleId: string; contentPrompt: string }) =>
      workflowService.regenerateByRule(ruleId, { contentPrompt }),
    onSuccess: (_data, { ruleId }) => {
      void queryClient.invalidateQueries({ queryKey: ["workflow", "rule", ruleId] })
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
      if (ruleId) void queryClient.invalidateQueries({ queryKey: ["workflow", "rule", ruleId] })
      else void queryClient.invalidateQueries({ queryKey: ["workflow", workflowId] })
    },
    onError: () => {
      toast.error("Failed to save. Please try again.")
    },
  })
}
