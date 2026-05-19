import { describe, expect, it } from "vitest"

import type { WfRfNode } from "@/features/workflow/data/workflow-model"
import { expandLegacySingleAdapt } from "@/features/workflow/lib/workflow-lane-expand"

const channels = [
  { id: "instagram", label: "Instagram" },
  { id: "linkedin", label: "LinkedIn" },
]

function baseGraph(): { nodes: WfRfNode[]; edges: ReturnType<typeof buildEdges> } {
  const nodes: WfRfNode[] = [
    {
      id: "kw",
      type: "wfNode",
      position: { x: 0, y: 0 },
      data: {
        label: "Keyword Planner",
        wfType: "keywords",
        status: "idle",
        locked: false,
        config: {},
        lane: null,
      },
      draggable: true,
    },
    {
      id: "text",
      type: "wfNode",
      position: { x: 200, y: 0 },
      data: {
        label: "Text",
        wfType: "text",
        status: "idle",
        locked: false,
        config: {},
        lane: null,
      },
      draggable: true,
    },
    {
      id: "branch",
      type: "branchNode",
      position: { x: 400, y: 0 },
      data: {
        label: "Branch",
        wfType: "branch",
        status: "idle",
        locked: false,
        config: {},
        lane: null,
        channelHandles: channels,
      },
      draggable: true,
    },
    {
      id: "adapt",
      type: "wfNode",
      position: { x: 600, y: 0 },
      data: {
        label: "Adapt",
        wfType: "adapt",
        status: "idle",
        locked: false,
        config: {},
        lane: null,
      },
      draggable: true,
    },
    {
      id: "image",
      type: "wfNode",
      position: { x: 800, y: 0 },
      data: {
        label: "Image",
        wfType: "image",
        status: "idle",
        locked: false,
        config: {},
        lane: null,
      },
      draggable: true,
    },
    {
      id: "merge",
      type: "mergeNode",
      position: { x: 1000, y: 0 },
      data: {
        label: "Merge",
        wfType: "merge",
        status: "idle",
        locked: false,
        config: {},
        lane: null,
        channelHandles: channels,
      },
      draggable: true,
    },
  ]
  return {
    nodes,
    edges: buildEdges([
      ["kw", "text"],
      ["text", "branch"],
      ["branch", "adapt"],
      ["adapt", "image"],
      ["image", "merge"],
    ]),
  }
}

function buildEdges(pairs: [string, string][]) {
  return pairs.map(([source, target]) => ({
    id: `e-${source}-${target}`,
    source,
    target,
    type: "plus_edge" as const,
    animated: true,
  }))
}

describe("expandLegacySingleAdapt", () => {
  it("wires each lane adapt through image to merge", () => {
    const { nodes, edges } = baseGraph()
    const { nodes: outNodes, edges: outEdges } = expandLegacySingleAdapt(
      nodes,
      edges,
      channels,
    )

    expect(outNodes.some((n) => n.id === "adapt")).toBe(false)
    expect(outNodes.some((n) => n.id === "image")).toBe(false)

    const igAdapt = outNodes.find(
      (n) => n.data.wfType === "adapt" && n.data.lane === "instagram",
    )
    const liAdapt = outNodes.find(
      (n) => n.data.wfType === "adapt" && n.data.lane === "linkedin",
    )
    expect(igAdapt).toBeDefined()
    expect(liAdapt).toBeDefined()

    const igImage = outNodes.find(
      (n) => n.data.wfType === "image" && n.data.lane === "instagram",
    )
    const liImage = outNodes.find(
      (n) => n.data.wfType === "image" && n.data.lane === "linkedin",
    )
    expect(igImage).toBeDefined()
    expect(liImage).toBeDefined()

    expect(outEdges).toContainEqual(
      expect.objectContaining({
        source: "branch",
        target: igAdapt!.id,
        sourceHandle: "instagram",
      }),
    )
    expect(outEdges).toContainEqual(
      expect.objectContaining({ source: igAdapt!.id, target: igImage!.id }),
    )
    expect(outEdges).toContainEqual(
      expect.objectContaining({
        source: igImage!.id,
        target: "merge",
        targetHandle: "instagram",
      }),
    )
    expect(outEdges).toContainEqual(
      expect.objectContaining({
        source: liAdapt!.id,
        target: liImage!.id,
      }),
    )
    expect(
      outEdges.some((e) => e.source === "image" || e.target === "image"),
    ).toBe(false)
  })
})
