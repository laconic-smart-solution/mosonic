import { describe, expect, it } from "vitest"

import type { WfRfNode } from "@/features/workflow/data/workflow-model"
import {
  ensurePipelineMergeNode,
  inferPipelineMergeNodeId,
  layoutTemplateGraphToRf,
  pipelineGraphToRf,
} from "./branch-layout"

function wfNode(
  id: string,
  wfType: string,
  lane: string | null = null,
): WfRfNode {
  return {
    id,
    type: "wfNode",
    position: { x: 0, y: 0 },
    data: {
      label: wfType,
      wfType,
      status: "idle",
      locked: false,
      config: lane ? { laneId: lane } : {},
      lane,
    },
    draggable: true,
  }
}

describe("layoutTemplateGraphToRf", () => {
  it("places lane adapts on different Y than trunk", () => {
    const nodes: WfRfNode[] = [
      wfNode("text", "text"),
      {
        id: "branch",
        type: "branchNode",
        position: { x: 0, y: 0 },
        data: {
          label: "Branch",
          wfType: "branch",
          status: "idle",
          locked: false,
          config: {},
          channelHandles: [],
        },
        draggable: true,
      },
      wfNode("adapt_ig", "adapt", "instagram"),
      wfNode("adapt_fb", "adapt", "facebook"),
      {
        id: "merge",
        type: "mergeNode",
        position: { x: 0, y: 0 },
        data: {
          label: "Merge",
          wfType: "merge",
          status: "idle",
          locked: false,
          config: {},
        },
        draggable: true,
      },
    ]
    const edges = [
      {
        id: "e-text-branch",
        source: "text",
        target: "branch",
        type: "plus_edge",
      },
      {
        id: "e-branch-adapt_ig-instagram-merge-in",
        source: "branch",
        target: "adapt_ig",
        sourceHandle: "instagram",
        type: "plus_edge",
      },
      {
        id: "e-branch-adapt_fb-facebook-merge-in",
        source: "branch",
        target: "adapt_fb",
        sourceHandle: "facebook",
        type: "plus_edge",
      },
      {
        id: "e-adapt_ig--merge-in",
        source: "adapt_ig",
        target: "merge",
        targetHandle: "in",
        type: "plus_edge",
      },
      {
        id: "e-adapt_fb--merge-in",
        source: "adapt_fb",
        target: "merge",
        targetHandle: "in",
        type: "plus_edge",
      },
    ]
    const { nodes: laidOut } = layoutTemplateGraphToRf(nodes, edges, [
      { id: "instagram", label: "Instagram" },
      { id: "facebook", label: "Facebook" },
    ])
    const ig = laidOut.find((n) => n.id === "adapt_ig")!
    const fb = laidOut.find((n) => n.id === "adapt_fb")!
    const text = laidOut.find((n) => n.id === "text")!
    expect(ig.position.y).not.toBe(text.position.y)
    expect(fb.position.y).not.toBe(text.position.y)
    expect(ig.position.y).not.toBe(fb.position.y)
    expect(ig.position.x).toBeGreaterThan(
      laidOut.find((n) => n.id === "branch")!.position.x,
    )
  })

  it("lays out linear graphs horizontally", () => {
    const nodes = [wfNode("a", "keywords"), wfNode("b", "text")]
    const edges = [
      { id: "e-a-b", source: "a", target: "b", type: "plus_edge" },
    ]
    const { nodes: laidOut } = layoutTemplateGraphToRf(nodes, edges)
    expect(laidOut[1]!.position.x).toBeGreaterThan(laidOut[0]!.position.x)
    expect(laidOut[0]!.position.y).toBe(laidOut[1]!.position.y)
  })
})

describe("pipelineGraphToRf", () => {
  it("synthesizes merge node when omitted from stored pipeline nodes", () => {
    const snapNodes = [
      {
        nodeId: "text-1",
        type: "text_generation" as const,
        order: 1,
        isLocked: true,
        userPrompt: "",
        config: {},
        status: "completed" as const,
        output: null,
        retryCount: 0,
        executedAt: null,
      },
      {
        nodeId: "adapt-1__instagram",
        type: "adapt" as const,
        order: 2,
        isLocked: false,
        userPrompt: "",
        config: { channel: "instagram" },
        lane: "instagram",
        status: "completed" as const,
        output: null,
        retryCount: 0,
        executedAt: null,
      },
      {
        nodeId: "adapt-1__facebook",
        type: "adapt" as const,
        order: 3,
        isLocked: false,
        userPrompt: "",
        config: { channel: "facebook" },
        lane: "facebook",
        status: "completed" as const,
        output: null,
        retryCount: 0,
        executedAt: null,
      },
    ]
    const snapEdges = [
      { from: "text-1", to: "adapt-1__instagram" },
      { from: "text-1", to: "adapt-1__facebook" },
      { from: "adapt-1__instagram", to: "merge-1" },
      { from: "adapt-1__facebook", to: "merge-1" },
    ]

    expect(inferPipelineMergeNodeId(snapNodes, snapEdges)).toBe("merge-1")
    expect(ensurePipelineMergeNode(snapNodes, snapEdges).some((n) => n.type === "merge")).toBe(
      true,
    )

    const { nodes, edges } = pipelineGraphToRf({
      nodes: snapNodes,
      edges: snapEdges,
      lanes: ["instagram", "facebook"],
      channelHandles: [
        { id: "instagram", label: "Instagram" },
        { id: "facebook", label: "Facebook" },
      ],
    })

    const merge = nodes.find((n) => n.data.wfType === "merge")
    expect(merge).toBeDefined()
    expect(merge?.id).toBe("merge-1")
    expect(edges.some((e) => e.target === "merge-1")).toBe(true)
  })

  it("seeds each node's status from the real pipeline snapshot, not a hardcoded idle", () => {
    const snapNodes = [
      {
        nodeId: "text-1",
        type: "text_generation" as const,
        order: 1,
        isLocked: true,
        userPrompt: "",
        config: {},
        status: "completed" as const,
        output: null,
        retryCount: 0,
        executedAt: null,
      },
      {
        nodeId: "adapt-1__instagram",
        type: "adapt" as const,
        order: 2,
        isLocked: false,
        userPrompt: "",
        config: {},
        lane: "instagram",
        status: "running" as const,
        output: null,
        retryCount: 0,
        executedAt: null,
      },
      {
        nodeId: "adapt-1__facebook",
        type: "adapt" as const,
        order: 3,
        isLocked: false,
        userPrompt: "",
        config: {},
        lane: "facebook",
        status: "failed" as const,
        output: null,
        retryCount: 0,
        executedAt: null,
      },
    ]
    const snapEdges = [
      { from: "text-1", to: "adapt-1__instagram" },
      { from: "text-1", to: "adapt-1__facebook" },
      { from: "adapt-1__instagram", to: "merge-1" },
      { from: "adapt-1__facebook", to: "merge-1" },
    ]

    const { nodes } = pipelineGraphToRf({
      nodes: snapNodes,
      edges: snapEdges,
      lanes: ["instagram", "facebook"],
      channelHandles: [
        { id: "instagram", label: "Instagram" },
        { id: "facebook", label: "Facebook" },
      ],
    })

    expect(nodes.find((n) => n.id === "text-1")?.data.status).toBe("completed")
    expect(nodes.find((n) => n.id === "adapt-1__instagram")?.data.status).toBe(
      "running",
    )
    // Runtime-status "failed" maps to the display status "failed_final".
    expect(nodes.find((n) => n.id === "adapt-1__facebook")?.data.status).toBe(
      "failed_final",
    )
  })
})
