import { describe, expect, it } from "vitest"

import { formatLaneNodeLabel } from "./lane-node-label"

describe("lane-node-label", () => {
  it("formats summarization lane label", () => {
    expect(formatLaneNodeLabel("summarization", "Facebook")).toBe(
      "Summary For Facebook",
    )
  })

  it("formats adapt lane label", () => {
    expect(formatLaneNodeLabel("adapt", "Instagram")).toBe(
      "Adapt For Instagram",
    )
  })
})
