import { describe, expect, it } from "vitest"

import {
  laneMediaFromNodeOutputs,
  resolveLaneMediaForChannel,
} from "@/features/upload/lib/upload-lane-media"
import type { WorkflowNodeLayersSnapshot } from "@/features/upload/lib/upload-lane-media"

describe('upload-lane-media', () => {
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

  it("resolveLaneMediaForChannel uses lane media and does not fall back to flattened resolved", () => {
    const resolved = {
      text: "trunk",
      image: "https://cdn.example/flattened-from-fb.jpg",
      video: "https://cdn.example/trunk.mp4",
    }
    expect(resolveLaneMediaForChannel("instagram", resolved, layers)).toEqual({
      image: "https://cdn.example/ig.jpg",
    })
    expect(resolveLaneMediaForChannel("linkedin", resolved, layers)).toEqual({})
  })

  it("resolveLaneMediaForChannel falls back to unlaned trunk layers", () => {
    const withTrunk: WorkflowNodeLayersSnapshot = {
      nodeOutputs: {
        image_gen: { image: "https://cdn.example/shared.jpg" },
        image__facebook: { image: "https://cdn.example/fb.jpg" },
      },
      nodeUserEdits: {},
    }
    expect(
      resolveLaneMediaForChannel("instagram", { text: "t" }, withTrunk),
    ).toEqual({
      image: "https://cdn.example/shared.jpg",
    })
    expect(
      resolveLaneMediaForChannel("facebook", { text: "t" }, withTrunk),
    ).toEqual({
      image: "https://cdn.example/fb.jpg",
    })
  })
})
