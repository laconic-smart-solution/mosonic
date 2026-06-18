import { describe, expect, it } from "vitest"

import { NODE_W, PIPE_GAP, type WfRfNode } from "@/features/workflow/data/workflow-model"

import {
  addNodeAfter,
  buildPlusEdge,
  insertNodeBetween,
  materializeBranchSubgraph,
  repairOrphanLaneAdapts,
  replaceInitialPlaceholder,
} from "./workflow-canvas-mutations"

function textNode(id: string, x = 0, y = 100): WfRfNode {
  return {
    id,
    type: "wfNode",
    position: { x, y },
    data: {
      label: "Text",
      wfType: "text",
      status: "idle",
      locked: false,
      config: {},
    },
    draggable: true,
  }
}

describe("workflow-canvas-mutations", () => {
  it("buildPlusEdge uses plus_edge type", () => {
    const edge = buildPlusEdge("a", "b")
    expect(edge.type).toBe("plus_edge")
    expect(edge.id).toBe("e-a--b-")
  })

  it("buildPlusEdge passes lane handles for Branch/Merge wiring", () => {
    const edge = buildPlusEdge("adapt-1", "merge-1", {
      targetHandle: "linkedin",
    })
    expect(edge.targetHandle).toBe("linkedin")
    expect(edge.id).toBe("e-adapt-1--merge-1-linkedin")
  })

  it("replaceInitialPlaceholder swaps placeholder for real node", () => {
    let nodes: WfRfNode[] = [
      {
        id: "plus-start",
        type: "plus_placeholder",
        position: { x: 0, y: 0 },
        data: { label: "", wfType: "", status: "idle", locked: false, config: {} },
        draggable: false,
      },
    ]
    const created = replaceInitialPlaceholder({
      wfType: "text",
      setNodes: (updater) => {
        nodes = typeof updater === "function" ? updater(nodes) : updater
      },
    })
    expect(nodes).toHaveLength(1)
    expect(nodes[0]?.data.wfType).toBe("text")
    expect(created.data.wfType).toBe("text")
  })

  it("addNodeAfter places node to the right of source", () => {
    const source = textNode("t", 80, 140)
    let nodes: WfRfNode[] = [source]
    let edges: ReturnType<typeof buildPlusEdge>[] = []

    addNodeAfter({
      sourceId: "t",
      wfType: "image",
      nodes,
      edges,
      setNodes: (u) => {
        nodes = typeof u === "function" ? u(nodes) : u
      },
      setEdges: (u) => {
        edges = typeof u === "function" ? u(edges) : u
      },
    })

    expect(nodes).toHaveLength(2)
    const added = nodes.find((n) => n.id !== "t")
    expect(added?.position.x).toBe(source.position.x + NODE_W + PIPE_GAP)
    expect(added?.position.y).toBe(source.position.y)
    expect(edges).toHaveLength(1)
    expect(edges[0]?.source).toBe("t")
  })

  it("insertNodeBetween shifts target to the right", () => {
    const step = NODE_W + PIPE_GAP
    const a = textNode("a", 0, 100)
    const b = textNode("b", step, 100)
    let nodes: WfRfNode[] = [a, b]
    const edge = buildPlusEdge("a", "b")
    let edges = [edge]

    insertNodeBetween({
      edgeId: edge.id,
      wfType: "translation",
      nodes,
      edges,
      setNodes: (u) => {
        nodes = typeof u === "function" ? u(nodes) : u
      },
      setEdges: (u) => {
        edges = typeof u === "function" ? u(edges) : u
      },
    })

    expect(nodes).toHaveLength(3)
    const shiftedB = nodes.find((n) => n.id === "b")
    expect(shiftedB?.position.x).toBe(step + step)
    expect(shiftedB?.position.y).toBe(100)
    expect(edges).toHaveLength(2)
  })

  it("addNodeAfter branch spawns adapt and merge nodes per channel", () => {
    const channels = [
      { id: "instagram", label: "Instagram" },
      { id: "facebook", label: "Facebook" },
    ]
    const source = textNode("t", 0, 140)
    let nodes: WfRfNode[] = [source]
    let edges: ReturnType<typeof buildPlusEdge>[] = []

    addNodeAfter({
      sourceId: "t",
      wfType: "branch",
      nodes,
      edges,
      setNodes: (u) => {
        nodes = typeof u === "function" ? u(nodes) : u
      },
      setEdges: (u) => {
        edges = typeof u === "function" ? u(edges) : u
      },
      branchChannels: channels,
    })

    expect(nodes.some((n) => n.type === "branchNode")).toBe(true)
    expect(nodes.filter((n) => n.data.wfType === "adapt")).toHaveLength(2)
    expect(nodes.some((n) => n.type === "mergeNode")).toBe(true)
    expect(edges.some((e) => e.sourceHandle === "instagram")).toBe(true)
    expect(edges.some((e) => e.targetHandle === "facebook")).toBe(true)
  })

  it("materializeBranchSubgraph is a no-op without channels", () => {
    const branch: WfRfNode = {
      id: "branch",
      type: "branchNode",
      position: { x: 320, y: 140 },
      data: {
        label: "Branch",
        wfType: "branch",
        status: "idle",
        locked: false,
        config: {},
      },
      draggable: true,
    }
    const result = materializeBranchSubgraph([branch], [], "branch", [])
    expect(result.nodes).toHaveLength(1)
    expect(result.edges).toHaveLength(0)
  })

  it("repairOrphanLaneAdapts removes unassigned adapts and spawns per channel", () => {
    const channels = [
      { id: "instagram", label: "Instagram" },
      { id: "facebook", label: "Facebook" },
    ]
    const nodes: WfRfNode[] = [
      textNode("t", 0, 140),
      {
        id: "branch",
        type: "branchNode",
        position: { x: 320, y: 140 },
        data: {
          label: "Branch",
          wfType: "branch",
          status: "idle",
          locked: false,
          config: {},
        },
        draggable: true,
      },
      {
        id: "orphan1",
        type: "wfNode",
        position: { x: 560, y: 80 },
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
        id: "orphan2",
        type: "wfNode",
        position: { x: 560, y: 200 },
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
        id: "merge",
        type: "mergeNode",
        position: { x: 800, y: 140 },
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
      { id: "e1", source: "t", target: "branch", type: "plus_edge" },
      { id: "e2", source: "branch", target: "orphan1", type: "plus_edge" },
      { id: "e3", source: "branch", target: "orphan2", type: "plus_edge" },
      { id: "e4", source: "orphan1", target: "merge", type: "plus_edge" },
      { id: "e5", source: "orphan2", target: "merge", type: "plus_edge" },
    ]

    const { nodes: repaired, repaired: didRepair } = repairOrphanLaneAdapts(
      nodes,
      edges,
      channels,
    )
    expect(didRepair).toBe(true)
    expect(repaired.some((n) => n.id === "orphan1" || n.id === "orphan2")).toBe(
      false,
    )
    const adapts = repaired.filter((n) => n.data.wfType === "adapt")
    expect(adapts).toHaveLength(2)
    expect(adapts.map((n) => n.data.lane).sort()).toEqual(["facebook", "instagram"])
  })
})
