import { describe, expect, it } from "vitest"

import {
  apiNodesToRf,
  rfNodesToApiPayload,
  type WfRfNode,
} from "./workflow-model"

describe("workflow save round-trip", () => {
  it("persists lane edge handles and config.laneId from data.lane", () => {
    const rfNodes: WfRfNode[] = [
      {
        id: "branch",
        type: "branchNode",
        position: { x: 100, y: 140 },
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
        id: "adapt_ig",
        type: "wfNode",
        position: { x: 300, y: 40 },
        data: {
          label: "Adapt",
          wfType: "adapt",
          status: "idle",
          locked: false,
          config: { tone: "casual" },
          lane: "instagram",
        },
        draggable: true,
      },
    ]
    const edges = [
      {
        id: "e-branch-adapt_ig-instagram-in",
        source: "branch",
        target: "adapt_ig",
        sourceHandle: "instagram",
        targetHandle: "in",
        type: "plus_edge",
      },
    ]
    const payload = rfNodesToApiPayload(rfNodes, edges)
    expect(payload.nodes.find((n) => n.nodeId === "branch")).toMatchObject({
      x: 100,
      y: 140,
    })
    expect(payload.nodes.find((n) => n.nodeId === "adapt_ig")).toMatchObject({
      x: 300,
      y: 40,
    })
    expect(payload.edges[0]).toMatchObject({
      from: "branch",
      to: "adapt_ig",
      sourceHandle: "instagram",
      targetHandle: "in",
    })
    expect(payload.nodes.find((n) => n.nodeId === "adapt_ig")?.config).toMatchObject({
      laneId: "instagram",
      tone: "casual",
    })

    const reloaded = apiNodesToRf(payload.nodes, payload.edges, {
      channelHandles: [{ id: "instagram", label: "Instagram" }],
    })
    const laneEdge = reloaded.edges.find((e) => e.target === "adapt_ig")
    expect(laneEdge?.sourceHandle).toBe("instagram")
    expect(laneEdge?.targetHandle).toBe("in")
    expect(reloaded.nodes.find((n) => n.id === "branch")?.position).toEqual({
      x: 100,
      y: 140,
    })
    expect(reloaded.nodes.find((n) => n.id === "adapt_ig")?.position).toEqual({
      x: 300,
      y: 40,
    })
  })

  it("auto-layouts nodes missing persisted coordinates while keeping saved ones", () => {
    const reloaded = apiNodesToRf(
      [
        {
          nodeId: "text",
          type: "text_generation",
          order: 1,
          isLocked: false,
          x: 50,
          y: 50,
        },
        {
          nodeId: "image",
          type: "image_generation",
          order: 2,
          isLocked: false,
        },
      ],
      [{ from: "text", to: "image" }],
    )
    expect(reloaded.nodes.find((n) => n.id === "text")?.position).toEqual({
      x: 50,
      y: 50,
    })
    const imagePos = reloaded.nodes.find((n) => n.id === "image")?.position
    expect(imagePos).toBeDefined()
    expect(imagePos?.x).not.toBe(50)
  })

  it("persists translation lane in config and top-level lane field", () => {
    const rfNodes: WfRfNode[] = [
      {
        id: "trans_li",
        type: "wfNode",
        position: { x: 400, y: 200 },
        data: {
          label: "Translation",
          wfType: "translation",
          status: "idle",
          locked: false,
          config: { targetLanguage: "es" },
          lane: "linkedin",
        },
        draggable: true,
      },
    ]
    const payload = rfNodesToApiPayload(rfNodes, [])
    const row = payload.nodes[0]
    expect(row?.config).toMatchObject({ laneId: "linkedin", targetLanguage: "es" })
    expect(row).toMatchObject({ lane: "linkedin" })

    const reloaded = apiNodesToRf(payload.nodes, [])
    expect(reloaded.nodes[0]?.data.lane).toBe("linkedin")
    expect(
      (reloaded.nodes[0]?.data.config as { laneId?: string }).laneId,
    ).toBe("linkedin")
  })
})
