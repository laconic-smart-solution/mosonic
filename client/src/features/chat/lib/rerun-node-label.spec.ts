import { describe, expect, it } from "vitest"

import {
  contentCardWorkingKey,
  nodeStillPending,
  pendingNodeTypeFromResult,
  rerunToolLabelKey,
} from "./rerun-node-label"

describe("pendingNodeTypeFromResult", () => {
  it("reads pendingNodeType from the observation JSON", () => {
    expect(
      pendingNodeTypeFromResult(
        JSON.stringify({
          ok: true,
          action: "content_rerun_started",
          pendingNodeId: "img-uuid",
          pendingNodeType: "image_generation",
        }),
      ),
    ).toBe("image_generation")
  })

  it("does not invent a type from a nodeId", () => {
    expect(
      pendingNodeTypeFromResult(
        JSON.stringify({ ok: true, pendingNodeId: "image", pendingNodeType: null }),
      ),
    ).toBeNull()
  })
})

describe("rerunToolLabelKey", () => {
  it("maps image_generation to the image label", () => {
    expect(rerunToolLabelKey("image_generation")).toBe("toolCall.rerunImageNode")
    expect(rerunToolLabelKey("text_generation")).toBe("toolCall.rerunCaptionNode")
    expect(rerunToolLabelKey(null)).toBe("toolCall.rerunContentNode")
  })
})

describe("contentCardWorkingKey", () => {
  it("picks image copy for image_generation", () => {
    expect(contentCardWorkingKey("image_generation")).toBe("contentCard.workingImage")
  })
})

describe("nodeStillPending", () => {
  it("requires _pending true, not merely an existing output", () => {
    expect(
      nodeStillPending({ "n-1": { image: "https://old.png" } }, "n-1"),
    ).toBe(false)
    expect(
      nodeStillPending({ "n-1": { image: "https://old.png", _pending: true } }, "n-1"),
    ).toBe(true)
  })
})
