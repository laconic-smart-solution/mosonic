import { describe, expect, it } from "vitest"

import { buildGenerationNodesForContent } from "./upload-generation-nodes"
import type { PipelineNodeSnapshot } from "@/shared/types/pipeline.type"
import type { WorkflowNode } from "@/shared/types/workflow.type"

describe("buildGenerationNodesForContent", () => {
  const templateNodes: WorkflowNode[] = [
    {
      nodeId: "text",
      type: "text_generation",
      order: 1,
      isLocked: false,
      config: {},
    },
    {
      nodeId: "adapt_ig",
      type: "adapt",
      order: 2,
      isLocked: false,
      config: { laneId: "instagram" },
    },
    {
      nodeId: "branch",
      type: "branch",
      order: 3,
      isLocked: false,
      config: {},
    },
  ]

  const pipelineNodes: PipelineNodeSnapshot[] = [
    {
      nodeId: "text",
      type: "text_generation",
      order: 1,
      isLocked: false,
      config: {},
    },
    {
      nodeId: "adapt_ig__instagram",
      type: "adapt",
      order: 2,
      isLocked: false,
      lane: "instagram",
      config: { tone: "casual" },
    },
    {
      nodeId: "adapt_ig__facebook",
      type: "adapt",
      order: 3,
      isLocked: false,
      lane: "facebook",
      config: { tone: "formal" },
    },
    {
      nodeId: "merge__main",
      type: "merge",
      order: 4,
      isLocked: false,
      config: {},
    },
    {
      nodeId: "intel",
      type: "intelligence",
      order: 5,
      isLocked: false,
      config: {},
    },
  ]

  it("prefers pipeline nodes and skips branch/merge", () => {
    const cards = buildGenerationNodesForContent(
      pipelineNodes,
      templateNodes,
      {
        text: { text: "hello" },
        "adapt_ig__instagram": { text: "ig caption" },
        "adapt_ig__facebook": { text: "fb caption" },
      },
    )
    expect(cards.map((n) => n.nodeId)).toEqual([
      "text",
      "adapt_ig__instagram",
      "adapt_ig__facebook",
    ])
    expect(cards.some((n) => n.type === "intelligence")).toBe(false)
    expect(cards[1]?.config.laneId).toBe("instagram")
  })

  it("falls back to nodeOutputs keys when pipeline is missing", () => {
    const cards = buildGenerationNodesForContent(undefined, templateNodes, {
      "adapt_ig__instagram": { text: "ig" },
      text: { text: "body" },
    })
    expect(cards.some((n) => n.nodeId === "adapt_ig__instagram")).toBe(true)
    expect(cards.some((n) => n.type === "branch")).toBe(false)
  })

  it("includes generate-more workflow node when pipeline snapshot is stale", () => {
    const genMoreId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
    const workflowWithGenMore: WorkflowNode[] = [
      ...templateNodes,
      {
        nodeId: genMoreId,
        type: "image_generation",
        order: 10,
        isLocked: false,
        config: { model: "gpt-image-1", aspectRatio: "1:1" },
      },
    ]
    const cards = buildGenerationNodesForContent(
      pipelineNodes,
      workflowWithGenMore,
      {
        text: { text: "hello" },
        "adapt_ig__instagram": { text: "ig caption" },
        "adapt_ig__facebook": { text: "fb caption" },
      },
    )
    expect(cards.map((n) => n.nodeId)).toEqual([
      "text",
      "adapt_ig__instagram",
      "adapt_ig__facebook",
      genMoreId,
    ])
    expect(cards.some((n) => n.nodeId === "adapt_ig")).toBe(false)
  })

  it("includes generate-more nodeOutputs key before workflow refetch", () => {
    const genMoreId = "f47ac10b-58cc-4372-a567-0e02b2c3d479"
    const cards = buildGenerationNodesForContent(
      pipelineNodes,
      templateNodes,
      {
        text: { text: "hello" },
        "adapt_ig__instagram": { text: "ig" },
        [genMoreId]: { image: "https://cdn.example/img.png" },
      },
    )
    expect(cards.some((n) => n.nodeId === genMoreId)).toBe(true)
    expect(cards.find((n) => n.nodeId === genMoreId)?.type).toBe(
      "image_generation",
    )
  })
})
