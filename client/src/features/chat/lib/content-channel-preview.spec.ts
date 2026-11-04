import { describe, expect, it } from "vitest"
import {
  collectContentChannels,
  previewForChannel,
  type ContentDraftNode,
} from "./content-channel-preview"

const nodes: ContentDraftNode[] = [
  {
    nodeId: "n-text",
    type: "text_generation",
    lane: null,
    field: "text",
    preview: "Trunk caption",
  },
  {
    nodeId: "n-adapt-ig",
    type: "adapt",
    lane: "instagram",
    field: "text",
    preview: "IG short caption",
  },
  {
    nodeId: "n-img-ig",
    type: "image_generation",
    lane: "instagram",
    field: "image",
    preview: "https://cdn.example/ig.jpg",
  },
  {
    nodeId: "n-adapt-fb",
    type: "adapt",
    lane: "facebook",
    field: "text",
    preview: "FB longer caption",
  },
]

describe("collectContentChannels", () => {
  it("merges lanes and node lanes in stable order", () => {
    expect(collectContentChannels(["tiktok", "instagram"], nodes)).toEqual([
      "tiktok",
      "instagram",
      "facebook",
    ])
  })

  it("dedupes and lowercases", () => {
    expect(collectContentChannels(["Instagram", "instagram"], nodes)).toEqual([
      "instagram",
      "facebook",
    ])
  })
})

describe("previewForChannel", () => {
  it("uses lane-specific text and image", () => {
    const preview = previewForChannel("instagram", nodes, {
      text: "Trunk caption",
      imageUrl: "https://cdn.example/trunk.jpg",
    })
    expect(preview.text).toBe("IG short caption")
    expect(preview.imageUrl).toBe("https://cdn.example/ig.jpg")
  })

  it("falls back to trunk when lane has no media", () => {
    const preview = previewForChannel("facebook", nodes, {
      text: "Trunk caption",
      imageUrl: "https://cdn.example/trunk.jpg",
    })
    expect(preview.text).toBe("FB longer caption")
    expect(preview.imageUrl).toBe("https://cdn.example/trunk.jpg")
  })

  it("falls back to trunk text when channel has no adapt node", () => {
    const preview = previewForChannel("tiktok", nodes, {
      text: "Trunk caption",
      imageUrl: null,
    })
    expect(preview.text).toBe("Trunk caption")
    expect(preview.imageUrl).toBeNull()
  })

  it("falls back to trunk image node when lane has no image", () => {
    const withTrunkImage: ContentDraftNode[] = [
      ...nodes,
      {
        nodeId: "n-img-trunk",
        type: "image_generation",
        lane: null,
        field: "image",
        preview: "https://cdn.example/trunk.jpg",
      },
    ]
    const preview = previewForChannel("facebook", withTrunkImage, {
      text: "Trunk caption",
      imageUrl: null,
    })
    expect(preview.imageUrl).toBe("https://cdn.example/trunk.jpg")
  })
})
