import { describe, expect, it } from "vitest"
import { findRunBriefs } from "./parse-run-brief"

describe("findRunBriefs", () => {
  it("reads the brief of a started run", () => {
    const result = JSON.stringify({ ok: true, action: "pipeline_started", pipelineId: "p1", brief: { topic: "Spring mugs", channels: ["tiktok"], style: "Watercolor", images: true } })
    expect(findRunBriefs([{ type: "observation", name: "start_generation", result } as never])).toEqual([
      { pipelineId: "p1", topic: "Spring mugs", channels: ["tiktok"], style: "Watercolor", images: true },
    ])
    expect(findRunBriefs(null)).toEqual([])
  })
})
