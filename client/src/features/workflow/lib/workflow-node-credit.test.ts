import { resolveWfNodeCreditKey } from "./workflow-node-credit"

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
