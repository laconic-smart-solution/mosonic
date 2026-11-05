import { describe, expect, it } from "vitest"
import { formatAttachmentMarker, splitAttachments } from "./chat-attachments"

describe("splitAttachments", () => {
  it("pulls asset markers and legacy notes out of the text", () => {
    const msg = ["store this", formatAttachmentMarker("reference_image", "a1", "https://cdn.test/x.png"), "(Attached: 1234.png)"].join("\n")
    const { text, attachments } = splitAttachments(msg)
    expect(text).toBe("store this")
    expect(attachments).toEqual([
      { type: "reference_image", id: "a1", url: "https://cdn.test/x.png" },
      { type: "file", id: "1234.png", url: null, name: "1234.png" },
    ])
  })
})
