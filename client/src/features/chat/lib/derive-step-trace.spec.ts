import { describe, expect, it } from "vitest"
import { deriveStepTrace } from "./derive-step-trace"
import type { AgentStep } from "@/shared/services/chat.service"

describe("deriveStepTrace", () => {
  it("builds plan / thinking / doing from a preview confirm turn", () => {
    const steps: AgentStep[] = [
      { type: "action", name: "get_rule", args: {}, toolCallId: "1" },
      { type: "observation", name: "get_rule", toolCallId: "1", result: "{\"ok\":true}" },
      { type: "action", name: "start_generation", args: {}, toolCallId: "2" },
      {
        type: "observation",
        name: "start_generation",
        toolCallId: "2",
        result: JSON.stringify({
          action: "ask_user",
          type: "single",
          question: "Ready?",
          options: [
            { id: "start_post", label: "Start" },
            { id: "cancel", label: "Cancel" },
          ],
          plan: {
            youAskedFor: ["Posts for Facebook, TikTok"],
            willChange: ["Add TikTok"],
            notPossible: ["Pixel-exact device frame"],
          },
          gaps: {
            channels: ["Facebook", "TikTok"],
            shared: false,
            missingVideo: false,
            missingChannels: ["TikTok"],
          },
          preview: {
            steps: [
              { nodeId: "n1", type: "keyword_planner", order: 0, lane: null, settings: {} },
              { nodeId: "n2", type: "caption", order: 1, lane: null, settings: {} },
              { nodeId: "n3", type: "adapt", order: 2, lane: "facebook", settings: {} },
              { nodeId: "n4", type: "image_generation", order: 3, lane: "facebook", settings: {}, badge: "adding" },
            ],
            lanes: ["facebook", "tiktok"],
            issues: [],
            videoSteps: 0,
          },
        }),
      },
    ]
    const trace = deriveStepTrace(steps)
    expect(trace?.phase).toBe("waiting")
    expect(trace?.plan?.willChange).toContain("Add TikTok")
    expect(trace?.thinking.some((l) => /TikTok/i.test(l.text))).toBe(true)
    expect(trace?.doing.length).toBe(6)
    expect(trace?.doing[0].status).toBe("done")
    expect(trace?.doing[1].status).toBe("waiting")
    expect(trace?.doing[2].labelFallback).toMatch(/keyword/i)
    expect(trace?.doing[4].labelFallback).toMatch(/Adapt for Facebook/i)
    expect(trace?.doing[5].labelFallback).toMatch(/Image/i)
    expect(trace?.doneCount).toBe(1)
    expect(trace?.totalCount).toBe(6)
  })
})
