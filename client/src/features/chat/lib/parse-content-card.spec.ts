import { describe, expect, it } from "vitest"
import { findContentCards, parseContentCard } from "./parse-content-card"

describe("parseContentCard", () => {
  it("parses a content preview", () => {
    const card = parseContentCard(
      JSON.stringify({
        ok: true,
        action: "show_content",
        contentId: "c-1",
        pipelineId: "pipe-1",
        workflowId: "wf-1",
        status: "draft",
        textPreview: "Sale post",
        hasImage: true,
      }),
    )
    expect(card).toMatchObject({
      contentId: "c-1",
      status: "draft",
      hasImage: true,
      textPreview: "Sale post",
    })
  })

  it("keeps only the latest card per content id", () => {
    const first = JSON.stringify({
      ok: true,
      action: "generate_more_started",
      contentId: "c-1",
      status: "draft",
      pendingNodeId: "n-1",
    })
    const second = JSON.stringify({
      ok: true,
      action: "show_content",
      contentId: "c-1",
      status: "draft",
      hasImage: true,
    })
    const cards = findContentCards([
      { type: "observation", result: first },
      { type: "observation", result: second },
    ])
    expect(cards).toHaveLength(1)
    expect(cards[0].action).toBe("show_content")
    expect(cards[0].hasImage).toBe(true)
  })

  it("rejects list payloads and failures", () => {
    expect(parseContentCard("{")).toBeNull()
    expect(
      parseContentCard(JSON.stringify({ ok: true, action: "list_contents", contentId: "c-1" })),
    ).toBeNull()
    expect(
      parseContentCard(JSON.stringify({ ok: false, action: "show_content", contentId: "c-1" })),
    ).toBeNull()
  })

  it("parses lanes and nodes for channel preview", () => {
    const card = parseContentCard(
      JSON.stringify({
        ok: true,
        action: "show_content",
        contentId: "c-2",
        status: "draft",
        textPreview: "Trunk",
        lanes: ["instagram", "facebook"],
        nodes: [
          {
            nodeId: "n-ig",
            type: "adapt",
            lane: "instagram",
            field: "text",
            preview: "IG copy",
          },
          {
            nodeId: "bad",
            type: "adapt",
          },
        ],
      }),
    )
    expect(card?.lanes).toEqual(["instagram", "facebook"])
    expect(card?.nodes).toEqual([
      {
        nodeId: "n-ig",
        type: "adapt",
        lane: "instagram",
        field: "text",
        preview: "IG copy",
        pending: false,
      },
    ])
  })

  it("accepts publish_started for the content card", () => {
    const card = parseContentCard(
      JSON.stringify({
        ok: true,
        action: "publish_started",
        contentId: "c-3",
        status: "approved",
      }),
    )
    expect(card?.action).toBe("publish_started")
  })
})

  it("surfaces pipeline_result as a content draft card", () => {
    const card = parseContentCard(
      JSON.stringify({
        ok: true,
        action: "pipeline_result",
        contentId: "c-9",
        pipelineId: "pipe-9",
        status: "completed",
        hasImage: true,
      }),
    )
    expect(card).toMatchObject({
      action: "show_content",
      contentId: "c-9",
      status: "draft",
      hasImage: true,
    })
  })

  it("ignores pipeline_result without contentId", () => {
    expect(
      parseContentCard(
        JSON.stringify({
          ok: true,
          action: "pipeline_result",
          pipelineId: "pipe-9",
          status: "completed",
        }),
      ),
    ).toBeNull()
  })

