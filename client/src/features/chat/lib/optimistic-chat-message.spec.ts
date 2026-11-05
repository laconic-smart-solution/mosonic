import { describe, expect, it } from "vitest"
import type { InfiniteData } from "@tanstack/react-query"

import type { ChatMessage, ChatMessagePage } from "@/shared/services/chat.service"
import {
  commitChatTurnMessages,
  createPendingUserMessage,
  PENDING_USER_MESSAGE_ID,
  withPendingUserMessage,
} from "./optimistic-chat-message"

const msg = (id: string, role: ChatMessage["role"] = "user", content = id): ChatMessage => ({
  messageId: id,
  sessionId: "s1",
  role,
  content,
  steps: null,
  inputTokens: null,
  outputTokens: null,
  createdAt: "2026-11-05T10:00:00.000Z",
})

describe("withPendingUserMessage", () => {
  it("appends a pending bubble while sending", () => {
    const pending = createPendingUserMessage("s1", "Hello")
    expect(pending.messageId).toBe(PENDING_USER_MESSAGE_ID)
    expect(withPendingUserMessage([msg("a")], pending).map((m) => m.messageId)).toEqual([
      "a",
      PENDING_USER_MESSAGE_ID,
    ])
  })

  it("does not duplicate when the server already has the user turn", () => {
    const pending = createPendingUserMessage("s1", "Hello")
    const messages = [msg("a"), msg("user-1", "user", "Hello")]
    expect(withPendingUserMessage(messages, pending)).toEqual(messages)
  })

  it("passes through when nothing is pending", () => {
    const messages = [msg("a")]
    expect(withPendingUserMessage(messages, null)).toBe(messages)
  })

  it("commits the finished turn into an empty cache", () => {
    const next = commitChatTurnMessages(undefined, {
      userMessage: msg("u1", "user", "Hi"),
      assistantMessage: msg("a1", "assistant", "Hello"),
    })
    expect(next.pages[0].messages.map((m) => m.messageId)).toEqual(["u1", "a1"])
  })

  it("appends the finished turn without duplicating", () => {
    const data: InfiniteData<ChatMessagePage> = {
      pageParams: [null],
      pages: [{ messages: [msg("old"), msg("u1", "user", "Hi")], hasMore: false, nextCursor: null }],
    }
    const next = commitChatTurnMessages(data, {
      userMessage: msg("u1", "user", "Hi"),
      assistantMessage: msg("a1", "assistant", "Hello"),
    })
    expect(next.pages[0].messages.map((m) => m.messageId)).toEqual(["old", "u1", "a1"])
  })
})
