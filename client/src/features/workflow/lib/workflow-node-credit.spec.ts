import { describe, expect, it } from "vitest"

import { resolveWfNodeCreditKey, estimateCreditsFromCanvasNodes } from "./workflow-node-credit"

describe("resolveWfNodeCreditKey", () => {
  it("returns null for branch and merge", () => {
    expect(resolveWfNodeCreditKey("branch")).toBeNull()
    expect(resolveWfNodeCreditKey("merge")).toBeNull()
  })

  it("maps canvas types to backend credit keys", () => {
    expect(resolveWfNodeCreditKey("keywords")).toBe("keyword_planner")
    expect(resolveWfNodeCreditKey("intelligence")).toBe("intelligence")
    expect(resolveWfNodeCreditKey("text")).toBe("text_generation")
    expect(resolveWfNodeCreditKey("adapt")).toBe("adapt")
  })

  it("resolves video presenter vs cinematic credit keys", () => {
    expect(resolveWfNodeCreditKey("video", { mode: "presenter" })).toBe(
      "video_generation_presenter",
    )
    expect(resolveWfNodeCreditKey("video", { mode: "cinematic" })).toBe(
      "video_generation_cinematic",
    )
    expect(resolveWfNodeCreditKey("video", {})).toBe(
      "video_generation_cinematic",
    )
  })
})

describe("estimateCreditsFromCanvasNodes", () => {
  it("aggregates live canvas nodes into run cost", () => {
    const estimate = estimateCreditsFromCanvasNodes(
      [
        { data: { wfType: "keywords" } },
        { data: { wfType: "intelligence" } },
        { data: { wfType: "text" } },
        { data: { wfType: "branch" } },
        { data: { wfType: "adapt" } },
        { data: { wfType: "adapt" } },
        { data: { wfType: "merge" } },
        { type: "plus_placeholder", data: { wfType: "text" } },
      ],
      {
        keyword_planner: 5,
        intelligence: 5,
        text_generation: 5,
        adapt: 4,
      },
      100,
    )

    expect(estimate.totalCredits).toBe(23)
    expect(estimate.sufficient).toBe(true)
    expect(estimate.breakdown).toEqual([
      {
        nodeType: "adapt",
        count: 2,
        creditsEach: 4,
        creditsTotal: 8,
      },
      {
        nodeType: "intelligence",
        count: 1,
        creditsEach: 5,
        creditsTotal: 5,
      },
      {
        nodeType: "keyword_planner",
        count: 1,
        creditsEach: 5,
        creditsTotal: 5,
      },
      {
        nodeType: "text_generation",
        count: 1,
        creditsEach: 5,
        creditsTotal: 5,
      },
    ])
  })
})
