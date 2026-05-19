import { describe, expect, it } from "vitest"

import {
  normalizeLaneId,
  resolveBranchChannels,
} from "./branch-channels"

describe("branch-channels", () => {
  const ruleChannels = [
    { channel: "Instagram" },
    { channel: "LinkedIn" },
    { channel: "Facebook" },
  ]

  it("normalizeLaneId lowercases and trims", () => {
    expect(normalizeLaneId("  LinkedIn  ")).toBe("linkedin")
  })

  it("returns all rule channels for rule_channels mode", () => {
    const handles = resolveBranchChannels(ruleChannels, { mode: "rule_channels" })
    expect(handles).toHaveLength(3)
    expect(handles.map((h) => h.id)).toEqual(["instagram", "linkedin", "facebook"])
  })

  it("filters channels for manual mode", () => {
    const handles = resolveBranchChannels(ruleChannels, {
      mode: "manual",
      channelIds: ["linkedin", "instagram"],
    })
    expect(handles).toHaveLength(2)
    expect(handles.map((h) => h.id).sort()).toEqual(["instagram", "linkedin"])
  })

  it("dedupes ab_test variants by lane id", () => {
    const handles = resolveBranchChannels(ruleChannels, {
      mode: "ab_test",
      variants: [
        { id: "a", channel: "instagram" },
        { id: "b", channel: "Instagram" },
        { id: "c", channel: "linkedin" },
      ],
    })
    expect(handles).toHaveLength(2)
    expect(handles.map((h) => h.id).sort()).toEqual(["instagram", "linkedin"])
  })
})
