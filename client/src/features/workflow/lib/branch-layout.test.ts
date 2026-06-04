import { describe, expect, it } from "vitest"

import type { WfRfNode } from "@/features/workflow/data/workflow-model"
import { layoutTemplateGraphToRf } from "./branch-layout"

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
