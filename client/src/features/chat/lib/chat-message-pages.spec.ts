import { describe, expect, it } from "vitest"

import type { ChatMessage, ChatMessagePage } from "@/shared/services/chat.service"
import { chatDayKey, chatDayLabel, flattenChatMessagePages } from "./chat-message-pages"

const msg = (id: string): ChatMessage => ({
  messageId: id,
  sessionId: "s1",
  role: "user",
  content: id,
  steps: null,
  inputTokens: null,
  outputTokens: null,
  createdAt: "2026-11-02T10:00:00",
})
const page = (ids: string[], hasMore = false): ChatMessagePage => ({
  messages: ids.map(msg),
  hasMore,
  nextCursor: hasMore ? ids[0] : null,
})

describe("flattenChatMessagePages", () => {
  it("orders oldest-first across pages and dedupes overlaps", () => {
    const { messages, historicalIds } = flattenChatMessagePages([
      page(["c", "d", "e"], true),
      page(["a", "b", "c"]),
    ])
    expect(messages.map((m) => m.messageId)).toEqual(["a", "b", "c", "d", "e"])
    expect([...historicalIds]).toEqual(["a", "b"])
  })

  it("handles no data", () => {
    expect(flattenChatMessagePages(undefined).messages).toEqual([])
  })
})

describe("chatDayLabel", () => {
  const now = new Date(2026, 10, 2, 15, 0)
  it("labels today, yesterday and older dates", () => {
    expect(chatDayLabel(new Date(2026, 10, 2, 1).toISOString(), "en", now)).toEqual({ kind: "today" })
    expect(chatDayLabel(new Date(2026, 10, 1, 23).toISOString(), "en", now)).toEqual({ kind: "yesterday" })
    expect(chatDayLabel(new Date(2026, 9, 30, 9).toISOString(), "en", now)).toEqual({ kind: "date", text: "Oct 30" })
    expect(chatDayLabel(new Date(2025, 9, 30, 9).toISOString(), "en", now)).toEqual({ kind: "date", text: "Oct 30, 2025" })
  })
  it("groups by local day", () => {
    expect(chatDayKey(new Date(2026, 10, 2, 1).toISOString())).toBe(chatDayKey(new Date(2026, 10, 2, 23).toISOString()))
  })
})
