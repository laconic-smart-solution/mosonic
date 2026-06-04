import { describe, expect, it } from "vitest"

import { resolveFileObjectUrlCacheKey } from "./file-object-url-cache"

describe("resolveFileObjectUrlCacheKey", () => {
  it("dedupes by relativePath from file API URL", () => {
    const a = resolveFileObjectUrlCacheKey(
      "/api/file/v1/file?relativePath=uploads%2Fa.png"
    )
    const b = resolveFileObjectUrlCacheKey(
      "https://app.example/api/file/v1/file?relativePath=uploads%2Fa.png"
    )
    expect(a).toBe("rel:uploads/a.png")
    expect(b).toBe("rel:uploads/a.png")
    expect(a).toBe(b)
  })

  it("returns null for passthrough http URLs", () => {
    expect(resolveFileObjectUrlCacheKey("https://cdn.example.com/a.png")).toBe(
      null
    )
  })

  it("returns null for blob and data URLs", () => {
    expect(resolveFileObjectUrlCacheKey("blob:abc")).toBe(null)
    expect(resolveFileObjectUrlCacheKey("data:image/png;base64,abc")).toBe(null)
  })
})
