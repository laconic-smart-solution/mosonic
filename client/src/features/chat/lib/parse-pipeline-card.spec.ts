import { describe, expect, it } from "vitest"
import { findPipelineCards, parsePipelineCard } from "./parse-pipeline-card"

describe("parsePipelineCard", () => {
  it("parses a started pipeline with no node list", () => {
    const card = parsePipelineCard(
      JSON.stringify({
        ok: true,
        action: "pipeline_started",
        pipelineId: "pipe-1",
        workflowId: "wf-1",
        status: "running",
      }),
    )
    expect(card).toMatchObject({
      action: "pipeline_started",
      pipelineId: "pipe-1",
      status: "running",
      nodes: [],
      counts: {},
    })
  })

  it("parses a status snapshot", () => {
    const card = parsePipelineCard(
      JSON.stringify({
        ok: true,
        action: "pipeline_status",
        pipelineId: "pipe-1",
        workflowId: "wf-1",
        status: "failed",
        pausedNodeId: null,
        counts: { failed: 1 },
        nodes: [{ type: "image_generation", order: 2, status: "failed", retryCount: 1 }],
      }),
    )
    expect(card?.status).toBe("failed")
    expect(card?.nodes[0].retryCount).toBe(1)
  })

  it("keeps only the latest card per pipeline", () => {
    const started = JSON.stringify({
      ok: true,
      action: "pipeline_started",
      pipelineId: "pipe-1",
      workflowId: "wf-1",
      status: "running",
    })
    const status = JSON.stringify({
      ok: true,
      action: "pipeline_status",
      pipelineId: "pipe-1",
      workflowId: "wf-1",
      status: "completed",
    })
    const cards = findPipelineCards([
      { type: "observation", result: started },
      { type: "observation", result: status },
    ])
    expect(cards).toHaveLength(1)
    expect(cards[0].status).toBe("completed")
  })

  it("rejects malformed JSON and non-pipeline observations", () => {
    expect(parsePipelineCard("{")).toBeNull()
    expect(
      parsePipelineCard(JSON.stringify({ ok: true, action: "show_workflow", pipelineId: "pipe-1" })),
    ).toBeNull()
    expect(
      parsePipelineCard(JSON.stringify({ ok: false, action: "pipeline_started", pipelineId: "pipe-1" })),
    ).toBeNull()
  })
})
