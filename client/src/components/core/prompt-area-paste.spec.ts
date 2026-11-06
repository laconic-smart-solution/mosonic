import { describe, expect, it } from "vitest"

import { fileMatchesAccept, pastedFileLabel } from "./prompt-area"

describe("prompt-area paste helpers", () => {
  const accept = ".png,.jpg,.jpeg,.gif,.webp,.pdf,.docx,.txt,.md"

  it("accepts clipboard screenshot mime types without a filename", () => {
    expect(fileMatchesAccept({ name: "", type: "image/png" }, accept)).toBe(true)
    expect(fileMatchesAccept({ name: "", type: "image/jpeg" }, accept)).toBe(true)
  })

  it("rejects unsupported clipboard types", () => {
    expect(fileMatchesAccept({ name: "", type: "image/svg+xml" }, accept)).toBe(false)
    expect(fileMatchesAccept({ name: "notes.xyz", type: "" }, accept)).toBe(false)
  })

  it("labels unnamed image pastes", () => {
    expect(pastedFileLabel({ name: "", type: "image/png" })).toBe("pasted-image.png")
    expect(pastedFileLabel({ name: "shot.jpg", type: "image/jpeg" })).toBe("shot.jpg")
  })
})
