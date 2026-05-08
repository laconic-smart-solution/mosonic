import { useMutation, useQuery } from "@tanstack/react-query"
import { pipelineService } from "../services/pipeline.service"
import type { RetryNodePayload, StartPipelinePayload } from "../types/pipeline.type"

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
