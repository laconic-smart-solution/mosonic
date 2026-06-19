import { describe, expect, it } from "vitest"

import {
  getAllowedInitialTypes,
  getAllowedInsertTypes,
  getAllowedNextTypes,
  getBranchSubgraphLaneErrors,
  getVideoPresenterConfigErrors,
  inferGraphContext,
  mergeHeygenVideoConfig,
  wouldCreateCycle,
  type ValidationContext,
} from "./workflow-node-validation"

function ctx(
  nodes: Array<{ id: string; wfType: string; lane?: string }>,
  edges: Array<{ from: string; to: string }>,
  channelCount = 3,
): ValidationContext {
  return {
    channelCount,
    nodes: nodes.map((n) => ({
      id: n.id,
      data: { wfType: n.wfType, lane: n.lane },
    })),
    edges: edges.map((e) => ({ source: e.from, target: e.to })),
  }
}

describe("workflow-node-validation", () => {
  it("empty canvas offers three starter nodes", () => {
    expect(getAllowedInitialTypes(ctx([], []))).toEqual([
      "keywords",
      "intelligence",
      "text",
    ])
  })

  it("keywords can go to intelligence or text", () => {
    const c = ctx([{ id: "k", wfType: "keywords" }], [])
    expect(getAllowedNextTypes(c, "k")).toEqual(
      expect.arrayContaining(["intelligence", "text"]),
    )
  })

  it("keywords → intelligence → text chain is valid", () => {
    const c1 = ctx(
      [
        { id: "k", wfType: "keywords" },
        { id: "i", wfType: "intelligence" },
      ],
      [{ from: "k", to: "i" }],
    )
    expect(getAllowedNextTypes(c1, "i")).toEqual(["text"])

    const c2 = ctx(
      [
        { id: "k", wfType: "keywords" },
        { id: "t", wfType: "text" },
      ],
      [{ from: "k", to: "t" }],
    )
    expect(getAllowedNextTypes(c2, "k")).toContain("text")
  })

  it("transcription can go to summarization without text", () => {
    const c = ctx([{ id: "tr", wfType: "transcription" }], [])
    expect(getAllowedNextTypes(c, "tr")).toEqual(
      expect.arrayContaining(["text", "summarization", "translation"]),
    )
  })

  it("text trunk allows branch and flex types but not adapt or merge", () => {
    const c = ctx([{ id: "t", wfType: "text" }], [])
    const next = getAllowedNextTypes(c, "t")
    expect(next).toEqual(
      expect.arrayContaining(["image", "video", "summarization", "translation", "branch"]),
    )
    expect(next).not.toContain("adapt")
    expect(next).not.toContain("merge")
  })

  it("text hides branch with fewer than 2 channels", () => {
    const c = ctx([{ id: "t", wfType: "text" }], [], 1)
    expect(getAllowedNextTypes(c, "t")).not.toContain("branch")
  })

  it("branch does not offer manual adapt insertion", () => {
    const c = ctx(
      [
        { id: "t", wfType: "text" },
        { id: "b", wfType: "branch" },
      ],
      [{ from: "t", to: "b" }],
    )
    expect(getAllowedNextTypes(c, "b")).toEqual([])
  })

  it("lane adapt allows flex types but not trunk-only nodes", () => {
    const c = ctx(
      [
        { id: "t", wfType: "text" },
        { id: "b", wfType: "branch" },
        { id: "a", wfType: "adapt", lane: "instagram" },
      ],
      [
        { from: "t", to: "b" },
        { from: "b", to: "a" },
      ],
      3,
    )
    const next = getAllowedNextTypes(c, "a")
    expect(next).toEqual(
      expect.arrayContaining(["image", "video", "summarization", "translation"]),
    )
    expect(next).not.toContain("keywords")
    expect(next).not.toContain("intelligence")
    expect(next).not.toContain("branch")
    expect(next).not.toContain("merge")
  })

  it("linear image does not offer manual merge insertion", () => {
    const c = ctx(
      [
        { id: "t", wfType: "text" },
        { id: "i", wfType: "image" },
      ],
      [{ from: "t", to: "i" }],
    )
    expect(getAllowedNextTypes(c, "i")).not.toContain("merge")
  })

  it("linear image can chain another image for multi-image carousels", () => {
    const c = ctx(
      [
        { id: "t", wfType: "text" },
        { id: "i1", wfType: "image" },
      ],
      [{ from: "t", to: "i1" }],
    )
    expect(getAllowedNextTypes(c, "i1")).toContain("image")
  })

  it("branch graph image lane does not offer manual merge", () => {
    const c = ctx(
      [
        { id: "t", wfType: "text" },
        { id: "b", wfType: "branch" },
        { id: "a", wfType: "adapt", lane: "instagram" },
        { id: "i", wfType: "image", lane: "instagram" },
      ],
      [
        { from: "t", to: "b" },
        { from: "b", to: "a" },
        { from: "a", to: "i" },
      ],
      3,
    )
    expect(getAllowedNextTypes(c, "i")).not.toContain("merge")
  })

  it("hides adapt from branch when every lane already has an adapt", () => {
    const c = ctx(
      [
        { id: "t", wfType: "text" },
        { id: "b", wfType: "branch" },
        { id: "a1", wfType: "adapt", lane: "instagram" },
        { id: "a2", wfType: "adapt", lane: "linkedin" },
        { id: "a3", wfType: "adapt", lane: "facebook" },
        { id: "m", wfType: "merge" },
      ],
      [
        { from: "t", to: "b" },
        { from: "b", to: "a1" },
        { from: "b", to: "a2" },
        { from: "b", to: "a3" },
      ],
      3,
    )
    expect(getAllowedNextTypes(c, "b")).toEqual([])
  })

  it("merge has no outgoing options", () => {
    const c = ctx([{ id: "m", wfType: "merge" }], [])
    expect(getAllowedNextTypes(c, "m")).toEqual([])
  })

  it("insert between text and image allows translation", () => {
    const c = ctx(
      [
        { id: "t", wfType: "text" },
        { id: "i", wfType: "image" },
      ],
      [{ from: "t", to: "i" }],
    )
    expect(getAllowedInsertTypes(c, "t", "i")).toContain("translation")
  })

  it("insert between keywords and text allows intelligence only", () => {
    const c = ctx(
      [
        { id: "k", wfType: "keywords" },
        { id: "t", wfType: "text" },
      ],
      [{ from: "k", to: "t" }],
    )
    expect(getAllowedInsertTypes(c, "k", "t")).toEqual(["intelligence"])
    expect(getAllowedInsertTypes(c, "k", "t")).not.toContain("image")
  })

  it("insert between transcription and text yields empty when no valid middle step", () => {
    const c = ctx(
      [
        { id: "tr", wfType: "transcription" },
        { id: "t", wfType: "text" },
      ],
      [{ from: "tr", to: "t" }],
    )
    expect(getAllowedInsertTypes(c, "tr", "t")).toEqual([])
  })

  it("inferGraphContext marks adapt subgraph as lane", () => {
    const c = ctx(
      [
        { id: "t", wfType: "text" },
        { id: "b", wfType: "branch" },
        { id: "a", wfType: "adapt" },
      ],
      [
        { from: "t", to: "b" },
        { from: "b", to: "a" },
      ],
    )
    expect(inferGraphContext(c, "a")).toBe("lane")
    expect(inferGraphContext(c, "t")).toBe("trunk")
  })

  it("wouldCreateCycle detects a back-edge", () => {
    const nodes = [
      { id: "a", data: { wfType: "text" } },
      { id: "b", data: { wfType: "image" } },
    ]
    const edges = [{ source: "a", target: "b" }]
    expect(wouldCreateCycle(nodes, edges, "b", "a")).toBe(true)
    expect(wouldCreateCycle(nodes, edges, "a", "b")).toBe(false)
  })
})

describe("getBranchSubgraphLaneErrors", () => {
  it("flags translation in branch subgraph without lane when channelCount >= 2", () => {
    const rfNodes = [
      {
        id: "t",
        type: "wfNode" as const,
        position: { x: 0, y: 0 },
        data: {
          label: "Text",
          wfType: "text",
          status: "idle" as const,
          locked: false,
          config: {},
        },
        draggable: true,
      },
      {
        id: "b",
        type: "branchNode" as const,
        position: { x: 100, y: 0 },
        data: {
          label: "Branch",
          wfType: "branch",
          status: "idle" as const,
          locked: false,
          config: {},
        },
        draggable: true,
      },
      {
        id: "tr",
        type: "wfNode" as const,
        position: { x: 200, y: 0 },
        data: {
          label: "Translation",
          wfType: "translation",
          status: "idle" as const,
          locked: false,
          config: {},
          lane: null,
        },
        draggable: true,
      },
      {
        id: "m",
        type: "mergeNode" as const,
        position: { x: 300, y: 0 },
        data: {
          label: "Merge",
          wfType: "merge",
          status: "idle" as const,
          locked: false,
          config: {},
        },
        draggable: true,
      },
    ]
    const edges = [
      { id: "e1", source: "t", target: "b" },
      { id: "e2", source: "b", target: "tr" },
      { id: "e3", source: "tr", target: "m" },
    ]
    const errors = getBranchSubgraphLaneErrors(rfNodes, edges, 3)
    expect(errors.some((e) => e.includes("Translation"))).toBe(true)
  })

  it("allows single shared adapt without lane in branch subgraph", () => {
    const rfNodes = [
      {
        id: "t",
        type: "wfNode" as const,
        position: { x: 0, y: 0 },
        data: {
          label: "Text",
          wfType: "text",
          status: "idle" as const,
          locked: false,
          config: {},
        },
        draggable: true,
      },
      {
        id: "b",
        type: "branchNode" as const,
        position: { x: 100, y: 0 },
        data: {
          label: "Branch",
          wfType: "branch",
          status: "idle" as const,
          locked: false,
          config: {},
        },
        draggable: true,
      },
      {
        id: "a",
        type: "wfNode" as const,
        position: { x: 200, y: 0 },
        data: {
          label: "Adapt",
          wfType: "adapt",
          status: "idle" as const,
          locked: false,
          config: {},
          lane: null,
        },
        draggable: true,
      },
      {
        id: "m",
        type: "mergeNode" as const,
        position: { x: 300, y: 0 },
        data: {
          label: "Merge",
          wfType: "merge",
          status: "idle" as const,
          locked: false,
          config: {},
        },
        draggable: true,
      },
    ]
    const edges = [
      { id: "e1", source: "t", target: "b" },
      { id: "e2", source: "b", target: "a" },
      { id: "e3", source: "a", target: "m" },
    ]
    expect(getBranchSubgraphLaneErrors(rfNodes, edges, 3)).toEqual([])
  })
})

describe("mergeHeygenVideoConfig", () => {
  it("keeps presenter mode when cinematic UI is disabled and avatar is missing", () => {
    expect(
      mergeHeygenVideoConfig({}, { mode: "presenter", heygenVoiceId: "voice-1" }),
    ).toEqual({
      mode: "presenter",
      heygenVoiceId: "voice-1",
    })
  })

  it("allows presenter mode in draft while editing other fields before avatar is chosen", () => {
    expect(
      mergeHeygenVideoConfig(
        { mode: "presenter", heygenVoiceId: "voice-1" },
        { heygenMotionPrompt: "gentle nodding" },
      ),
    ).toEqual({
      mode: "presenter",
      heygenVoiceId: "voice-1",
      heygenMotionPrompt: "gentle nodding",
    })
  })

  it("keeps presenter mode when avatar is present in patch", () => {
    expect(
      mergeHeygenVideoConfig(
        {},
        {
          mode: "presenter",
          heygenAvatarId: "avatar-1",
          heygenVoiceId: "voice-1",
        },
      ),
    ).toEqual({
      mode: "presenter",
      heygenAvatarId: "avatar-1",
      heygenVoiceId: "voice-1",
    })
  })

  it("preserves motion prompt and other presenter fields", () => {
    expect(
      mergeHeygenVideoConfig(
        { mode: "presenter", heygenAvatarId: "avatar-1" },
        { heygenMotionPrompt: "gentle nodding" },
      ),
    ).toEqual({
      mode: "presenter",
      heygenAvatarId: "avatar-1",
      heygenMotionPrompt: "gentle nodding",
    })
  })
})

describe("getVideoPresenterConfigErrors", () => {
  it("requires avatar and voice in presenter mode", () => {
    const errors = getVideoPresenterConfigErrors({ mode: "presenter" })
    expect(errors).toHaveLength(2)
    expect(errors.some((e) => e.toLowerCase().includes("avatar"))).toBe(true)
    expect(errors.some((e) => e.toLowerCase().includes("voice"))).toBe(true)
  })
})
