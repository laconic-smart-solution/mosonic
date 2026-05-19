import { describe, expect, it } from "vitest"

import { palettePayloadForNode } from "./upload-palette-drag"

describe("palettePayloadForNode", () => {
  it("returns text drag payload for adapt nodes from layer.text", () => {
    const p = palettePayloadForNode(
      "adapt__linkedin",
      "adapt",
      { "adapt__linkedin": { text: "  lane copy  " } },
      {},
    )
    expect(p).toEqual({
      kind: "text",
      source: "text",
      nodeId: "adapt__linkedin",
    })
  })

  it("returns text drag payload for adapt nodes from adaptedCaption when text is empty", () => {
    const p = palettePayloadForNode(
      "adapt__instagram",
      "adapt",
      { "adapt__instagram": { adaptedCaption: "caption only" } },
      {},
    )
    expect(p).toEqual({
      kind: "text",
      source: "text",
      nodeId: "adapt__instagram",
    })
  })

  it("returns null for adapt when no text fields", () => {
    expect(
      palettePayloadForNode("adapt__x", "adapt", { "adapt__x": {} }, {}),
    ).toBeNull()
  })
})
