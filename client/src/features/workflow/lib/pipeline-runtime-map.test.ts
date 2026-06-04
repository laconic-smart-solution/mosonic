import { describe, expect, it } from "vitest"

import {
  mapPipelineRuntimeToCanvas,
  materializedNodeIdToCanvasId,
  resolveCanvasNodeIdToPipeline,
} from "./pipeline-runtime-map"

describe("materializedNodeIdToCanvasId", () => {
  it("strips lane suffix", () => {
    expect(materializedNodeIdToCanvasId("abc__instagram")).toBe("abc")
  })

  it("returns id unchanged when no suffix", () => {
    expect(materializedNodeIdToCanvasId("trunk-1")).toBe("trunk-1")
  })
})

describe("mapPipelineRuntimeToCanvas", () => {
  it("maps materialized ids onto template ids", () => {
    const mapped = mapPipelineRuntimeToCanvas({
      "uuid-ig__instagram": { status: "running" },
      "uuid-fb__facebook": { status: "completed" },
    })
    expect(mapped["uuid-ig"]).toEqual({ status: "running" })
    expect(mapped["uuid-fb"]).toEqual({ status: "completed" })
  })
})

describe("resolveCanvasNodeIdToPipeline", () => {
  const nodes = [
    { nodeId: "text-1", lane: null },
    { nodeId: "adapt-1__instagram", lane: "instagram" },
    { nodeId: "adapt-1__facebook", lane: "facebook" },
  ]

  it("returns direct match for trunk nodes", () => {
    expect(resolveCanvasNodeIdToPipeline("text-1", nodes)).toBe("text-1")
  })

  it("resolves lane clone by canvas lane", () => {
    expect(
      resolveCanvasNodeIdToPipeline("adapt-1", nodes, "facebook"),
    ).toBe("adapt-1__facebook")
  })
})
