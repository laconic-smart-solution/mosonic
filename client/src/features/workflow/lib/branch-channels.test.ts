import { describe, expect, it } from "vitest"

import {
  filterChannelsBySelection,
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

  it("an explicit wizard_channels selection is trusted even beyond the Rule's channels", () => {
    // Matches the server's channelIdsToChannelEntries, which also doesn't
    // require the channel to be on the Rule — a workflow can deliberately
    // target a channel the Rule hasn't been configured with yet.
    const handles = resolveBranchChannels(
      { mode: "wizard_channels", channels: ["tiktok", "youtube"] },
      [{ channel: "Instagram" }],
    )
    expect(handles.map((h) => h.id).sort()).toEqual(["tiktok", "youtube"])
  })

  it("falls back to the Rule's channels when no explicit wizard selection is set", () => {
    const handles = resolveBranchChannels(
      { mode: "wizard_channels", channels: [] },
      [{ channel: "Instagram" }],
    )
    expect(handles.map((h) => h.id)).toEqual(["instagram"])
  })

  describe("filterChannelsBySelection", () => {
    const allChannels = [
      { id: "instagram", label: "Instagram" },
      { id: "facebook", label: "Facebook" },
      { id: "tiktok", label: "TikTok" },
    ]

    it("narrows to the explicit selection, even a single channel not on the original set order", () => {
      const result = filterChannelsBySelection(allChannels, {
        mode: "wizard_channels",
        channels: ["tiktok"],
      })
      expect(result.map((c) => c.id)).toEqual(["tiktok"])
    })

    it("returns every channel when mode is not wizard_channels", () => {
      const result = filterChannelsBySelection(allChannels, {
        mode: "rule_channels",
      })
      expect(result).toBe(allChannels)
    })

    it("falls back to the full list if the selection matches nothing in it", () => {
      const result = filterChannelsBySelection(allChannels, {
        mode: "wizard_channels",
        channels: ["unknown_platform"],
      })
      expect(result).toBe(allChannels)
    })
  })
})
