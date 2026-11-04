import { describe, expect, it } from "vitest"

import { chatMessageTokenUsage } from "./chat-message-tokens"

describe("chatMessageTokenUsage", () => {
  it("returns null when both meters are empty", () => {
    expect(chatMessageTokenUsage({ inputTokens: null, outputTokens: null })).toBeNull()
    expect(chatMessageTokenUsage({ inputTokens: 0, outputTokens: 0 })).toBeNull()
  })

  it("sums input and output", () => {
    expect(chatMessageTokenUsage({ inputTokens: 1234, outputTokens: 56 })).toEqual({
      input: 1234,
      output: 56,
      total: 1290,
    })
  })

  it("treats a missing side as zero", () => {
    expect(chatMessageTokenUsage({ inputTokens: 10, outputTokens: null })).toEqual({
      input: 10,
      output: 0,
      total: 10,
    })
  })
})
