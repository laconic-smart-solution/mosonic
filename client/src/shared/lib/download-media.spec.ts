import { describe, expect, it } from "vitest"
import { filenameFromMediaUrl } from "./download-media"

describe("filenameFromMediaUrl", () => {
  it("keeps the original filename when the url has one", () => {
    expect(
      filenameFromMediaUrl(
        "uploads/user-1/generated-sunset.png",
        "image",
        "content"
      )
    ).toBe("generated-sunset.png")
  })

  it("extracts the filename from a file-service proxy URL", () => {
    const url =
      "https://api.example.com/api/file/v1/file?relativePath=uploads%2Fclip.mp4"
    expect(filenameFromMediaUrl(url, "video", "post")).toBe("clip.mp4")
  })

  it("falls back to a kind-appropriate default when there's no extension", () => {
    const name = filenameFromMediaUrl("blob:http://localhost/abc-123", "image", "node")
    expect(name).toMatch(/^node-\d+\.png$/)
  })

  it("falls back to a video default with the right extension", () => {
    const name = filenameFromMediaUrl(undefined, "video", "media")
    expect(name).toMatch(/^media-\d+\.mp4$/)
  })

  it("decodes percent-encoded filenames", () => {
    expect(
      filenameFromMediaUrl("uploads/campaign%20final.png", "image")
    ).toBe("campaign final.png")
  })
})
