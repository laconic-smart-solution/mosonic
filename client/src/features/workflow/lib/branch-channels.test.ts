import { describe, expect, it } from "vitest"

import {
  migrateBranchConfigFromRule,
  normalizeLaneId,
  resolveBranchChannels,
} from "./branch-channels"

describe("branch-channels", () => {
  it("normalizeLaneId trims and lowercases lane handles", () => {
    expect(normalizeLaneId(" Instagram ")).toBe("instagram")
  })

  const ruleChannels = [
    { channel: "Instagram" },
    { channel: "LinkedIn" },
    { channel: "Facebook" },
  ]

  it("resolves lanes from rule channels", () => {
    const handles = resolveBranchChannels(
      { mode: "rule_channels" },
      ruleChannels,
    )
    expect(handles).toHaveLength(3)
    expect(handles.map((h) => h.id).sort()).toEqual([
      "facebook",
      "instagram",
      "linkedin",
    ])
    expect(handles.find((h) => h.id === "facebook")?.label).toBe("Facebook")
  })

  it("returns empty when rule has no channels", () => {
    expect(resolveBranchChannels({ mode: "rule_channels" }, [])).toEqual([])
  })

  it("migrateBranchConfigFromRule always uses rule_channels mode", () => {
    expect(migrateBranchConfigFromRule({}, ruleChannels)).toEqual({
      mode: "rule_channels",
    })
  })

  it("ignores unknown channel names on the rule", () => {
    const handles = resolveBranchChannels({ mode: "rule_channels" }, [
      { channel: "Facebook" },
      { channel: "unknown_platform" },
    ])
    expect(handles).toHaveLength(1)
    expect(handles[0]?.id).toBe("facebook")
  })
})
