import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query"

import { toast } from "sonner"

import { invalidateForToolSteps } from "@/features/chat/lib/chat-tool-invalidation"
import { commitChatTurnMessages } from "@/features/chat/lib/optimistic-chat-message"
import i18n from "@/i18n"
import { parseApiError } from "@/shared/lib/api-error"
import { toastApiError } from "@/shared/lib/toast-error"
import { chatService, type ChatMessagePage } from "../services/chat.service"

export function useChatSessionsQuery(ruleId: string | undefined) {
  return useQuery({
    queryKey: ["chat-sessions", ruleId],
    queryFn: () => chatService.listSessions(ruleId as string),
    enabled: Boolean(ruleId),
  })
}

export function useCreateChatSessionMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ ruleId, title }: { ruleId?: string; title?: string }) =>
      chatService.createSession(ruleId, title),
    onSuccess: (_data, { ruleId }) => {
      if (ruleId) {
        void queryClient.invalidateQueries({ queryKey: ["chat-sessions", ruleId] })
      }
    },
    onError: (err) => {
      toastApiError(err, "chat:toast.createSessionFailed")
    },
  })
}

/** Thread history, newest page first; `fetchNextPage` loads older messages (scroll up). */
export function useChatMessagesQuery(sessionId: string | undefined) {
  return useInfiniteQuery({
    queryKey: ["chat-messages", sessionId],
    queryFn: ({ pageParam }) =>
      chatService.listMessages(sessionId as string, { before: pageParam ?? undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor : undefined),
    enabled: Boolean(sessionId),
  })
}

export function useSendChatMessageMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ sessionId, content }: { sessionId: string; content: string }) =>
      chatService.sendMessage(sessionId, content),
    onSuccess: (data, { sessionId }) => {
      queryClient.setQueryData<InfiniteData<ChatMessagePage>>(
        ["chat-messages", sessionId],
        (old) => commitChatTurnMessages(old, data),
      )
      void queryClient.invalidateQueries({ queryKey: ["chat-messages", sessionId] })
      // Tools the agent ran this turn may have changed workflow/content/rule/etc.
      invalidateForToolSteps(queryClient, data.assistantMessage?.steps)
      if (data.session.ruleId) {
        void queryClient.invalidateQueries({
          queryKey: ["chat-sessions", data.session.ruleId],
        })
      }
    },
    onError: (err) => {
      // 409 = the server still holds this session's turn lock (a reply is in progress).
      if (parseApiError(err).status === 409) {
        toast.warning(i18n.t("chat:toast.stillWorking"), { id: "chat-still-working" })
        return
      }
      toastApiError(err, "chat:toast.sendMessageFailed")
    },
  })
}
