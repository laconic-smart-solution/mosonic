import { describe, expect, it } from "vitest"

import { NODE_H, NODE_W, type WfRfNode } from "@/features/workflow/data/workflow-model"

import { resolvePaletteDropTarget } from "./workflow-palette-dnd"

function wfNode(
  id: string,
  wfType: string,
  x: number,
  y: number,
): WfRfNode {
  return {
    id,
    type: "wfNode",
    position: { x, y },
    data: {
      label: wfType,
      wfType,
      status: "idle",
      locked: false,
      config: {},
    },
    draggable: true,
  }
}

function centerOf(node: WfRfNode): { x: number; y: number } {
  return {
    x: node.position.x + NODE_W / 2,
    y: node.position.y + NODE_H / 2,
  }
}

describe("resolvePaletteDropTarget", () => {
  it("returns initial for empty graph when type is a starter", () => {
    const target = resolvePaletteDropTarget(
      { x: 100, y: 100 },
      "text",
      [],
      [],
      0,
    )
    expect(target).toEqual({ mode: "initial" })
  })

  it("returns null for empty graph when type is not a starter", () => {
    const target = resolvePaletteDropTarget(
      { x: 100, y: 100 },
      "image",
      [],
      [],
      0,
    )
    expect(target).toBeNull()
  })

  it("returns after when dropped on a node that accepts the type", () => {
    const text = wfNode("t", "text", 0, 0)
    const c = centerOf(text)
    const target = resolvePaletteDropTarget(
      c,
      "image",
      [text],
      [],
      0,
    )
    expect(target).toEqual({ mode: "after", sourceId: "t" })
  })

  it("returns between when dropped near an edge that allows insert", () => {
    const k = wfNode("k", "keywords", 0, 100)
    const t = wfNode("t", "text", NODE_W + 80, 100)
    const mid = {
      x: (centerOf(k).x + centerOf(t).x) / 2,
      y: (centerOf(k).y + centerOf(t).y) / 2,
    }
    const target = resolvePaletteDropTarget(
      mid,
      "intelligence",
      [k, t],
      [{ id: "e-1", source: "k", target: "t" }],
      0,
    )
    expect(target?.mode).toBe("between")
    if (target?.mode === "between") {
      expect(target.edgeId).toBe("e-1")
    }
  })

  it("returns append to nearest sink when dropped on empty canvas area", () => {
    const k = wfNode("k", "keywords", 0, 100)
    const far = { x: k.position.x + NODE_W + 200, y: k.position.y + NODE_H / 2 }
    const target = resolvePaletteDropTarget(far, "text", [k], [], 0)
    expect(target).toEqual({ mode: "append", sourceId: "k" })
  })
})
