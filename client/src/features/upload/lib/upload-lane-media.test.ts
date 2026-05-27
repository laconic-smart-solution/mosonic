import { describe, expect, it } from "vitest"

import {
  laneMediaFromNodeOutputs,
  resolveLaneMediaForChannel,
} from "@/features/upload/lib/upload-lane-media"
import type { WorkflowNodeLayersSnapshot } from "@/features/upload/lib/upload-lane-media"

describe("upload-lane-media", () => {
  const layers: WorkflowNodeLayersSnapshot = {
    nodeOutputs: {
      image__instagram: { image: "https://cdn.example/ig.jpg" },
      image__facebook: { image: "https://cdn.example/fb.jpg" },
    },
    nodeUserEdits: {},
  }

  it("laneMediaFromNodeOutputs picks media for matching lane suffix", () => {
    expect(laneMediaFromNodeOutputs("instagram", layers)).toEqual({
      image: "https://cdn.example/ig.jpg",
    })
    expect(laneMediaFromNodeOutputs("facebook", layers)).toEqual({
      image: "https://cdn.example/fb.jpg",
    })
  })

  it("resolveLaneMediaForChannel prefers lane layers over trunk resolved", () => {
    const resolved = {
      text: "trunk",
      image: "https://cdn.example/trunk.jpg",
      video: "https://cdn.example/trunk.mp4",
    }
    expect(resolveLaneMediaForChannel("instagram", resolved, layers)).toEqual({
      image: "https://cdn.example/ig.jpg",
      video: "https://cdn.example/trunk.mp4",
    })
  })
})
