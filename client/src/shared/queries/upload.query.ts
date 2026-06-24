import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toastApiError } from "@/shared/lib/toast-error"
import { uploadService } from "../services/upload.service"
import type {
  PatchUploadChannelBody,
  PublishUploadRequest,
  UpdateUploadBody,
} from "../types/upload.type"

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
    mutationFn: ({
      uploadId,
      body,
    }: {
      uploadId: string
      body: PublishUploadRequest
    }) => uploadService.publish(uploadId, body),
    onSuccess: (_data, { uploadId }) => {
      void queryClient.invalidateQueries({ queryKey: ["upload", uploadId] })
      void queryClient.invalidateQueries({ queryKey: ["content"] })
    },
    onError: (err) => {
      toastApiError(err, "upload:toast.publishFailed")
    },
  })
}

export const usePatchUploadChannelMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      uploadId,
      channel,
      body,
    }: {
      uploadId: string
      channel: string
      body: PatchUploadChannelBody
    }) => uploadService.patchChannel(uploadId, channel, body),
    onSuccess: (_data, { uploadId }) => {
      void queryClient.invalidateQueries({ queryKey: ["upload", uploadId] })
    },
    onError: (err) => {
      toastApiError(err, "upload:toast.saveFailed")
    },
  })
}

export const useUpdateUploadMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      uploadId,
      body,
    }: {
      uploadId: string
      body: UpdateUploadBody
    }) => uploadService.update(uploadId, body),
    onSuccess: (_data, { uploadId }) => {
      void queryClient.invalidateQueries({ queryKey: ["upload", uploadId] })
    },
    onError: (err) => {
      toastApiError(err, "upload:toast.saveFailed")
    },
  })
}

export const useRetryUploadMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ uploadId }: { uploadId: string }) =>
      uploadService.retry(uploadId),
    onSuccess: (_data, { uploadId }) => {
      void queryClient.invalidateQueries({ queryKey: ["upload", uploadId] })
    },
    onError: (err) => {
      toastApiError(err, "upload:toast.publishFailed")
    },
  })
}

/** @deprecated Prefer deriving status from GET /upload/:id */
export const useGetUploadStatusQuery = (uploadId: string | undefined) => {
  return useQuery({
    queryKey: ["upload", uploadId, "status"],
    queryFn: () => uploadService.getStatus(uploadId!),
    enabled: !!uploadId,
    retry: false,
  })
}
