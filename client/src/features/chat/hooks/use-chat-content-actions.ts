import { useMutation, useQueryClient } from "@tanstack/react-query"

import { toastApiError } from "@/shared/lib/toast-error"
import { contentService, type SaveContentBody } from "@/shared/services/content.service"

function useInvalidateContent() {
  const queryClient = useQueryClient()
  return (contentId: string) => {
    void queryClient.invalidateQueries({ queryKey: ["content", contentId] })
    void queryClient.invalidateQueries({ queryKey: ["contents"] })
  }
}

/** Direct (non-chat) content actions used by the chat dialogs — existing /contents endpoints only. */
export function useApproveChatContentMutation() {
  const invalidate = useInvalidateContent()
  return useMutation({
    mutationFn: (contentId: string) => contentService.approve(contentId),
    onSuccess: (_data, contentId) => invalidate(contentId),
    onError: (err) => toastApiError(err, "chat:toast.approveFailed"),
  })
}

export function useRejectChatContentMutation() {
  const invalidate = useInvalidateContent()
  return useMutation({
    mutationFn: (contentId: string) => contentService.reject(contentId),
    onSuccess: (_data, contentId) => invalidate(contentId),
    onError: (err) => toastApiError(err, "chat:toast.rejectFailed"),
  })
}

export function useSaveChatContentMutation() {
  const invalidate = useInvalidateContent()
  return useMutation({
    mutationFn: ({ contentId, body }: { contentId: string; body: SaveContentBody }) =>
      contentService.save(contentId, body),
    onSuccess: (_data, { contentId }) => invalidate(contentId),
    onError: (err) => toastApiError(err, "chat:toast.saveContentFailed"),
  })
}
