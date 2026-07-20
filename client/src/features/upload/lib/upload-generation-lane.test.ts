import { describe, expect, it } from "vitest"

import {
  filterGenerationNodesForChannel,
  hasDisplayableNodeOutput,
  lanesMatch,
  resolveNodeLane,
  staticTextFromLayer,
  textFromLayer,
} from "./upload-generation-lane"
import type { PipelineNodeSnapshot } from "@/shared/types/pipeline.type"
import type { WorkflowNode } from "@/shared/types/workflow.type"

describe("upload-generation-lane", () => {
  it("lanesMatch compares normalized channel keys", () => {
    expect(lanesMatch("Instagram", "instagram")).toBe(true)
    expect(lanesMatch("instagram", "facebook")).toBe(false)
  })

  it("resolveNodeLane prefers pipeline lane then suffix", () => {
    const node: WorkflowNode = {
      nodeId: "adapt_ig__instagram",
      type: "adapt",
      order: 2,
      isLocked: false,
      config: {},
    }
    expect(resolveNodeLane(node, null)).toBe("instagram")
    expect(
      resolveNodeLane(node, {
        nodeId: "adapt_ig__instagram",
        type: "adapt",
        order: 2,
        isLocked: false,
        userPrompt: "",
        config: {},
        lane: "instagram",
        status: "completed",
        output: { text: "hi" },
        retryCount: 0,
        executedAt: null,
      }),
    ).toBe("instagram")
  })

  it("textFromLayer reads adaptedCaption", () => {
    expect(
      textFromLayer({ adaptedCaption: "IG caption", text: "" }),
    ).toBe("IG caption")
    expect(staticTextFromLayer({ adaptedCaption: "IG" }, "text")).toBe("IG")
  })

  it("hasDisplayableNodeOutput is true for adapt with adaptedCaption only", () => {
    const node: WorkflowNode = {
      nodeId: "adapt_ig__facebook",
      type: "adapt",
      order: 2,
      isLocked: false,
      config: {},
    }
    expect(
      hasDisplayableNodeOutput(node, {
        adapt_ig__facebook: { adaptedCaption: "FB post" },
      }, {}),
    ).toBe(true)
  })

  it("filterGenerationNodesForChannel hides empty and filters by lane", () => {
    const nodes: WorkflowNode[] = [
      {
        nodeId: "text",
        type: "text_generation",
        order: 1,
        isLocked: true,
        config: {},
      },
      {
        nodeId: "adapt_ig__instagram",
        type: "adapt",
        order: 2,
        isLocked: false,
        config: {},
      },
      {
        nodeId: "adapt_ig__facebook",
        type: "adapt",
        order: 3,
        isLocked: false,
        config: {},
      },
      {
        nodeId: "video__instagram",
        type: "video_generation",
        order: 4,
        isLocked: false,
        config: {},
      },
    ]
    const pipelineNodes: PipelineNodeSnapshot[] = [
      {
        nodeId: "text",
        type: "text_generation",
        order: 1,
        isLocked: true,
        userPrompt: "",
        config: {},
        status: "completed",
        output: { text: "shared body" },
        retryCount: 0,
        executedAt: null,
      },
      {
        nodeId: "adapt_ig__instagram",
        type: "adapt",
        order: 2,
        isLocked: false,
        userPrompt: "",
        config: {},
        lane: "instagram",
        status: "completed",
        output: { text: "ig" },
        retryCount: 0,
        executedAt: null,
      },
      {
        nodeId: "adapt_ig__facebook",
        type: "adapt",
        order: 3,
        isLocked: false,
        userPrompt: "",
        config: {},
        lane: "facebook",
        status: "completed",
        output: null,
        retryCount: 0,
        executedAt: null,
      },
      {
        nodeId: "video__instagram",
        type: "video_generation",
        order: 4,
        isLocked: false,
        userPrompt: "",
        config: {},
        lane: "instagram",
        status: "completed",
        output: null,
        retryCount: 0,
        executedAt: null,
      },
    ]

    const nodeOutputs = {
      text: { text: "shared body" },
      adapt_ig__instagram: { text: "ig caption" },
    }

    const instagramOnly = filterGenerationNodesForChannel(nodes, {
      filterKey: "instagram",
      pipelineNodes,
      nodeOutputs,
      nodeUserEdits: {},
    })
    expect(instagramOnly.map((n) => n.nodeId).sort()).toEqual([
      "adapt_ig__instagram",
      "text",
    ])

    const facebookOnly = filterGenerationNodesForChannel(nodes, {
      filterKey: "facebook",
      pipelineNodes,
      nodeOutputs,
      nodeUserEdits: {},
    })
    expect(facebookOnly.map((n) => n.nodeId)).toEqual(["text"])

    const all = filterGenerationNodesForChannel(nodes, {
      filterKey: "all",
      pipelineNodes,
      nodeOutputs,
      nodeUserEdits: {},
    })
    expect(all.map((n) => n.nodeId)).toEqual(["text", "adapt_ig__instagram"])
  })
})
