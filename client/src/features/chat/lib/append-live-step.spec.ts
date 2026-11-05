import { describe, expect, it } from "vitest"
import type { AgentStep } from "@/shared/services/chat.service"
import { appendLiveStep } from "./append-live-step"

describe("appendLiveStep", () => {
  const action = { type: "action", name: "list_channels", args: {}, toolCallId: "a" } as AgentStep
  const observation = { type: "observation", name: "list_channels", toolCallId: "a", result: "{}" } as AgentStep

  it("appends new steps in order", () => {
    expect(appendLiveStep(appendLiveStep([], action), observation)).toEqual([action, observation])
  })

  it("ignores a re-delivered action or observation with the same toolCallId", () => {
    const steps = [action, observation]
    expect(appendLiveStep(steps, { ...action })).toBe(steps)
    expect(appendLiveStep(steps, { ...observation })).toBe(steps)
  })

  it("keeps steps without an id (thoughts, legacy rows)", () => {
    const thought = { type: "thought", text: "x" } as AgentStep
    expect(appendLiveStep([thought], thought)).toHaveLength(2)
  })
})
