import { describe, expect, it } from "vitest"
import { findWorkflowCards, parseWorkflowCard } from "./parse-workflow-card"

describe("parseWorkflowCard", () => {
  it("parses a ready workflow and ignores config blobs", () => {
    const card = parseWorkflowCard(
      JSON.stringify({
        ok: true,
        action: "show_workflow",
        workflowId: "wf-1",
        ruleId: "rule-1",
        status: "ready",
        name: "Campaign",
        nodes: [
          { nodeId: "b", type: "image_generation", order: 2, lane: "instagram", isLocked: false, config: { size: "1024" } },
          { nodeId: "a", type: "text_generation", order: 1, lane: null, isLocked: true },
        ],
      }),
    )
    expect(card?.status).toBe("ready")
    expect(card?.nodes.map((node) => node.nodeId)).toEqual(["a", "b"])
    expect(card?.nodes[1].lane).toBe("instagram")
    expect(JSON.stringify(card)).not.toContain("1024")
  })

  it("parses a generating workflow with no nodes", () => {
    const card = parseWorkflowCard(
      JSON.stringify({
        ok: true,
        action: "show_workflow",
        workflowId: "wf-2",
        ruleId: "rule-1",
        status: "generating",
        name: "",
      }),
    )
    expect(card).toMatchObject({ status: "generating", nodes: [] })
  })

  it("parses a failed workflow", () => {
    const card = parseWorkflowCard(
      JSON.stringify({
        ok: true,
        action: "show_workflow",
        workflowId: "wf-3",
        ruleId: "rule-1",
        status: "failed",
        name: "Campaign",
        nodes: [],
      }),
    )
    expect(card?.status).toBe("failed")
  })

  it("keeps only the latest card per workflow when list then update both return show_workflow", () => {
    const listed = JSON.stringify({
      ok: true,
      action: "show_workflow",
      workflowId: "wf-1",
      ruleId: "rule-1",
      status: "ready",
      name: "Campaign",
      nodes: [{ nodeId: "img", type: "image_generation", order: 1, lane: "facebook", isLocked: false }],
    })
    const updated = JSON.stringify({
      ok: true,
      action: "show_workflow",
      workflowId: "wf-1",
      ruleId: "rule-1",
      status: "ready",
      name: "Campaign",
      nodes: [{ nodeId: "img", type: "image_generation", order: 1, lane: "linkedin", isLocked: false }],
    })
    const cards = findWorkflowCards([
      { type: "observation", result: listed },
      { type: "observation", result: updated },
    ])
    expect(cards).toHaveLength(1)
    expect(cards[0].nodes[0].lane).toBe("linkedin")
  })

  it("rejects malformed JSON, failures, and missing ids", () => {
    expect(parseWorkflowCard("not-json")).toBeNull()
    expect(
      parseWorkflowCard(JSON.stringify({ ok: false, code: "workflow_exists", action: "show_workflow" })),
    ).toBeNull()
    expect(
      parseWorkflowCard(JSON.stringify({ ok: true, action: "show_workflow", workflowId: "wf" })),
    ).toBeNull()
  })
})
