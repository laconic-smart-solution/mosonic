import { useCallback, useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"

import {
  joinChatRoom,
  leaveChatRoom,
  onChatCompleted,
  onChatFailed,
  onChatStarted,
  onChatStep,
} from "@/shared/socket/chat-events"
import type { AgentStep } from "@/shared/services/chat.service"

import { appendLiveStep } from "../lib/append-live-step"
import { invalidateForToolSteps } from "../lib/chat-tool-invalidation"

/** Live step-trace feed for the turn currently in flight in a chat session. */
export function useChatSteps(
  sessionId: string | null,
  /** Called when an automatic follow-up message was saved (refetch the thread). */
  onFollowUpCompleted?: (sessionId: string) => void,
) {
  const queryClient = useQueryClient()
  const onFollowUpRef = useRef(onFollowUpCompleted)
  onFollowUpRef.current = onFollowUpCompleted
  const [liveSteps, setLiveSteps] = useState<AgentStep[]>([])
  const [isActive, setIsActive] = useState(false)
  /** An automatic follow-up turn (run finished) is in flight - not started by the composer. */
  const [isFollowUp, setIsFollowUp] = useState(false)
  const sessionRef = useRef(sessionId)
  sessionRef.current = sessionId

  const prepareSession = useCallback((id: string) => {
    sessionRef.current = id
    // Start each send with an empty trace: if `chat:started` arrives before the room
    // join lands, the last turn's steps would otherwise show again under this one.
    setLiveSteps([])
    joinChatRoom(id)
  }, [])

  useEffect(() => {
    const matches = (id: string) => id === sessionRef.current

    const cleanupStarted = onChatStarted((payload) => {
      if (!matches(payload.sessionId)) return
      setLiveSteps([])
      setIsActive(true)
      setIsFollowUp(payload.followUp === true)
    })

    const cleanupStep = onChatStep((payload) => {
      if (!matches(payload.sessionId)) return
      setLiveSteps((prev) => appendLiveStep(prev, payload.step))
      // Refresh as soon as each tool result lands, not only when the whole turn ends.
      invalidateForToolSteps(queryClient, [payload.step])
    })

    const cleanupCompleted = onChatCompleted((payload) => {
      if (!matches(payload.sessionId)) return
      setIsActive(false)
      setIsFollowUp(false)
      // Covers follow-up turns (no HTTP response) and any step events missed on reconnect.
      invalidateForToolSteps(queryClient, payload.assistantMessage?.steps)
      if (payload.followUp) onFollowUpRef.current?.(payload.sessionId)
    })

    const cleanupFailed = onChatFailed((payload) => {
      if (!matches(payload.sessionId)) return
      setIsActive(false)
      setIsFollowUp(false)
    })

    return () => {
      cleanupStarted()
      cleanupStep()
      cleanupCompleted()
      cleanupFailed()
    }
  }, [queryClient])

  useEffect(() => {
    if (!sessionId) return
    joinChatRoom(sessionId)
    return () => {
      leaveChatRoom(sessionId)
    }
  }, [sessionId])

  return { liveSteps, isActive, isFollowUp: isActive && isFollowUp, prepareSession }
}
