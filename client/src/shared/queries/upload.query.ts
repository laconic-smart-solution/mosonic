import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { uploadService } from "../services/upload.service"

export const useGetUploadQuery = (uploadId: string | undefined) => {
  return useQuery({
    queryKey: ["upload", uploadId],
    queryFn: () => uploadService.getById(uploadId!),
    enabled: !!uploadId,
    retry: false,
  })
}

export const usePublishUploadMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (uploadId: string) => uploadService.publish(uploadId),
    onSuccess: (_data, uploadId) => {
      void queryClient.invalidateQueries({ queryKey: ["upload", uploadId] })
    },
  })
}
