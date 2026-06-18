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
  })
}

export type UseGetPipelineQueryOptions = {
  refetchInterval?: number | false
}

export const useGetPipelineQuery = (
  pipelineId: string | undefined,
  options?: UseGetPipelineQueryOptions,
) => {
  return useQuery({
    queryKey: ["pipeline", pipelineId],
    queryFn: () => pipelineService.getById(pipelineId!),
    enabled: !!pipelineId,
    retry: false,
    refetchInterval: options?.refetchInterval,
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
  })
}

export const useCancelPipelineMutation = () => {
  return useMutation({
    mutationFn: (pipelineId: string) => pipelineService.cancel(pipelineId),
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
