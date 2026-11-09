import type { InfiniteData } from "@tanstack/react-query"

import type {
  ChatMessage,
  ChatMessagePage,
  ChatTurnResult,
} from "@/shared/services/chat.service"

export const PENDING_USER_MESSAGE_ID = "pending-user"

/** Bubble shown while the send request is in flight (above the thinking row). */
export function createPendingUserMessage(
  sessionId: string,
  content: string,
  now: Date = new Date(),
): ChatMessage {
  return {
    messageId: PENDING_USER_MESSAGE_ID,
    sessionId,
    role: "user",
    content,
    steps: null,
    inputTokens: null,
    outputTokens: null,
    createdAt: now.toISOString(),
  }
}

/**
 * Merge a pending outbound user message into the thread list without duplicating
 * when the server page already contains the same user turn.
 */
export function withPendingUserMessage(
  messages: ChatMessage[],
  pending: ChatMessage | null,
): ChatMessage[] {
  if (!pending) return messages
  const exists = messages.some(
    (m) =>
      m.role === "user" &&
      m.content === pending.content &&
      m.sessionId === pending.sessionId,
  )
  if (exists) {
    return messages
  }
  return [...messages, pending]
}

/** Write the finished turn into the newest page so the pending bubble can drop without a gap. */
export function commitChatTurnMessages(
  data: InfiniteData<ChatMessagePage> | undefined,
  turn: Pick<ChatTurnResult, "userMessage" | "assistantMessage">,
): InfiniteData<ChatMessagePage> {
  const incoming = [turn.userMessage, turn.assistantMessage]
  if (!data || data.pages.length === 0) {
    return {
      pages: [{ messages: incoming, hasMore: false, nextCursor: null }],
      pageParams: [null],
    }
  }
  const pages = data.pages.map((page, index) => {
    if (index !== 0) return page
    const seen = new Set(page.messages.map((m) => m.messageId))
    const next = [...page.messages]
    for (const message of incoming) {
      if (!seen.has(message.messageId)) {
        next.push(message)
        seen.add(message.messageId)
      }
    }
    return { ...page, messages: next }
  })
  return { ...data, pages }
}
