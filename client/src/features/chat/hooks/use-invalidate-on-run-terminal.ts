import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"

import { onChatRunProgress } from "@/shared/socket/chat-events"

const TERMINAL = new Set(["completed", "failed"])

/**
 * When a chat-started generation finishes, refetch the content (and posts) lists
 * so the left rail updates without a manual refresh. Follow-up tool invalidation
 * covers the same caches later; this fires as soon as the run card says Finished.
 */
export function useInvalidateOnRunTerminal() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const unsubscribe = onChatRunProgress((progress) => {
      if (!TERMINAL.has(progress.status)) return
      void queryClient.invalidateQueries({ queryKey: ["contents"] })
      void queryClient.invalidateQueries({ queryKey: ["content"] })
      void queryClient.invalidateQueries({ queryKey: ["pipeline"] })
      void queryClient.invalidateQueries({ queryKey: ["posts"] })
      void queryClient.invalidateQueries({ queryKey: ["usage", "summary"] })
    })
    return () => {
      unsubscribe()
    }
  }, [queryClient])
}
