import { describe, expect, it } from "vitest"

import {
  mapPipelineRuntimeToCanvas,
  materializedNodeIdToCanvasId,
  mergePipelineRuntimeMaps,
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

describe("mergePipelineRuntimeMaps", () => {
  it("keeps completed socket state over pending API snapshot", () => {
    const merged = mergePipelineRuntimeMaps(
      { "node-1": { status: "completed", previewText: "done" } },
      { "node-1": { status: "pending" } },
    )
    expect(merged["node-1"]).toEqual({
      status: "completed",
      previewText: "done",
    })
  })

  it("applies running state from socket over idle API snapshot", () => {
    const merged = mergePipelineRuntimeMaps(
      { "node-2": { status: "running" } },
      { "node-2": { status: "idle" } },
    )
    expect(merged["node-2"]).toEqual({ status: "running" })
  })

  it("applies completed API snapshot over stale running socket state", () => {
    const merged = mergePipelineRuntimeMaps(
      { "node-3": { status: "running", previewText: "partial" } },
      { "node-3": { status: "completed", previewText: "final" } },
    )
    expect(merged["node-3"]).toEqual({
      status: "completed",
      previewText: "final",
    })
  })

  it("lets a later 'processing' event update the message set by an earlier 'running' event", () => {
    // Before the fix, running(50) outranked processing(40), so this update's
    // status and processingMessage were silently dropped — the card stayed
    // stuck showing the original generic "running" message forever.
    const merged = mergePipelineRuntimeMaps(
      {
        "node-4": {
          status: "running",
          processingMessage: "Generating…",
        },
      },
      {
        "node-4": {
          status: "processing",
          processingMessage: "Uploading image…",
        },
      },
    )
    expect(merged["node-4"]).toEqual({
      status: "processing",
      processingMessage: "Uploading image…",
    })
  })

  it("still keeps an in-progress socket status ahead of a stale pending API snapshot", () => {
    const merged = mergePipelineRuntimeMaps(
      { "node-5": { status: "processing", processingMessage: "Working…" } },
      { "node-5": { status: "pending" } },
    )
    expect(merged["node-5"].status).toBe("processing")
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
