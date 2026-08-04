import { describe, expect, it } from "vitest"

import {
  clearStaleUserEditsAfterRerun,
  mergeNodeOutputLayers,
} from "./content-review-helpers"

describe("clearStaleUserEditsAfterRerun", () => {
  it("drops the edited key a fresh rerun output supersedes", () => {
    const nodeUserEdits = { n1: { text: "my hand-edited caption" } }
    const result = clearStaleUserEditsAfterRerun(nodeUserEdits, "n1", {
      text: "freshly regenerated text",
    })
    expect(result.n1).toEqual({})
  })

  it("makes the fresh generated text visible again through the display merge", () => {
    const nodeOutputs = { n1: { text: "freshly regenerated text" } }
    const nodeUserEdits = { n1: { text: "my hand-edited caption" } }

    const cleared = clearStaleUserEditsAfterRerun(nodeUserEdits, "n1", {
      text: "freshly regenerated text",
    })

    expect(mergeNodeOutputLayers(nodeOutputs, cleared, "n1").text).toBe(
      "freshly regenerated text",
    )
    // Before the fix, the stale edit would still win here:
    expect(mergeNodeOutputLayers(nodeOutputs, nodeUserEdits, "n1").text).toBe(
      "my hand-edited caption",
    )
  })

  it("leaves edits for other keys on the same node untouched", () => {
    const nodeUserEdits = {
      n1: { text: "edited text", image: "https://example.com/user.png" },
    }
    const result = clearStaleUserEditsAfterRerun(nodeUserEdits, "n1", {
      text: "new text",
    })
    expect(result.n1).toEqual({ image: "https://example.com/user.png" })
  })

  it("is a no-op when the node has no saved edits", () => {
    const nodeUserEdits = {}
    const result = clearStaleUserEditsAfterRerun(nodeUserEdits, "n1", {
      text: "new text",
    })
    expect(result).toBe(nodeUserEdits)
  })

  it("is a no-op when the rerun output does not overlap any edited key", () => {
    const nodeUserEdits = { n1: { image: "https://example.com/user.png" } }
    const result = clearStaleUserEditsAfterRerun(nodeUserEdits, "n1", {
      text: "new text",
    })
    expect(result).toBe(nodeUserEdits)
  })

  it("leaves other nodes' edits untouched", () => {
    const nodeUserEdits = {
      n1: { text: "edited" },
      n2: { text: "other node edit" },
    }
    const result = clearStaleUserEditsAfterRerun(nodeUserEdits, "n1", {
      text: "new text",
    })
    expect(result.n2).toEqual({ text: "other node edit" })
  })
})
