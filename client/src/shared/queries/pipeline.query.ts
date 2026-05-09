import { useMutation, useQuery } from "@tanstack/react-query"
import { pipelineService } from "../services/pipeline.service"
import type {
  PipelinePageQueryPayload,
  RetryNodePayload,
  StartPipelinePayload,
} from "../types/pipeline.type"

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
