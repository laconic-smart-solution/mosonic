import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import i18n from "@/i18n"
import { pipelineService } from "../services/pipeline.service"
import type {
  PipelinePageQueryPayload,
  PipelineStatsResponse,
  RetryNodePayload,
  SkipNodePayload,
  StartPipelinePayload,
} from "../types/pipeline.type"

function assertPipelineStatsPayload(data: unknown): PipelineStatsResponse {
  if (
    !data ||
    typeof data !== "object" ||
    typeof (data as PipelineStatsResponse).total !== "number" ||
    typeof (data as PipelineStatsResponse).byStatus !== "object" ||
    (data as PipelineStatsResponse).byStatus === null
  ) {
    throw new Error(i18n.t("pipeline:errors.invalidStatsResponse"))
  }
  return data as PipelineStatsResponse
}

export const useStartPipelineMutation = () => {
  return useMutation({
    mutationFn: (payload: StartPipelinePayload) => pipelineService.startPipeline(payload),
    meta: { toastNs: "pipeline", toastKey: "errors.startFailed", silent: true },
  })
}

export const usePipelineEstimateQuery = (
  workflowId: string | undefined,
  ruleId: string | undefined,
  enabled = true,
) => {
  return useQuery({
    queryKey: ["pipeline", "estimate", workflowId ?? "", ruleId ?? ""],
    queryFn: () =>
      pipelineService.estimate({
        workflowId: workflowId!,
        ...(ruleId ? { ruleId } : {}),
      }),
    enabled: enabled && !!workflowId,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  })
}

export const useRetryNodeMutation = () => {
  return useMutation({
    mutationFn: ({
      pipelineId,
      payload,
    }: {
      pipelineId: string
      payload: RetryNodePayload
    }) => pipelineService.retryNode(pipelineId, payload),
    meta: { toastNs: "workflow", toastKey: "toasts.retryFailed", silent: true },
  })
}

export const useSkipNodeMutation = () => {
  return useMutation({
    mutationFn: ({
      pipelineId,
      payload,
    }: {
      pipelineId: string
      payload: SkipNodePayload
    }) => pipelineService.skipNode(pipelineId, payload),
    meta: { toastNs: "workflow", toastKey: "toasts.skipFailed", silent: true },
  })
}

export const useGetPipelineQuery = (pipelineId: string | undefined) => {
  return useQuery({
    queryKey: ["pipeline", pipelineId],
    queryFn: () => pipelineService.getById(pipelineId!),
    enabled: !!pipelineId,
    retry: false,
  })
}

export const usePipelinePageQuery = (
  payload: PipelinePageQueryPayload,
  enabled = true
) => {
  return useQuery({
    queryKey: ["pipeline", "pageable", payload],
    queryFn: () => pipelineService.pageable(payload),
    enabled,
    retry: false,
  })
}

export const usePipelineStatsQuery = (
  workflowRef?: string,
  enabled = true,
) => {
  return useQuery({
    queryKey: ["pipeline", "stats", workflowRef ?? ""],
    queryFn: async () =>
      assertPipelineStatsPayload(await pipelineService.stats(workflowRef)),
    enabled,
    retry: false,
  })
}

export const useReplanPipelineMutation = () => {
  return useMutation({
    mutationFn: ({
      pipelineId,
      operations,
    }: {
      pipelineId: string
      operations: Parameters<typeof pipelineService.replan>[1]
    }) => pipelineService.replan(pipelineId, operations),
    meta: { toastNs: "workflow", toastKey: "toasts.replanFailed", silent: true },
  })
}

export const useCancelPipelineMutation = () => {
  return useMutation({
    mutationFn: (pipelineId: string) => pipelineService.cancel(pipelineId),
    meta: { toastNs: "pipeline", toastKey: "errors.startFailed", silent: true },
  })
}

export const useUpdatePipelineNameMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      pipelineId,
      name,
    }: {
      pipelineId: string
      name: string
    }) => pipelineService.updateName(pipelineId, { name }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["pipeline"] })
    },
  })
}
