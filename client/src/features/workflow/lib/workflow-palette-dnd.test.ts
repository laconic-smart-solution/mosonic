import { describe, expect, it } from "vitest"

import { NODE_H, NODE_W, type WfRfNode } from "@/features/workflow/data/workflow-model"

import {
  listPaletteDropHints,
  paletteDropHintsMatch,
  resolvePaletteDropTarget,
} from "./workflow-palette-dnd"

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

describe("listPaletteDropHints", () => {
  it("returns initial hint for empty graph when type is a starter", () => {
    const hints = listPaletteDropHints("text", [], [], 0)
    expect(hints).toEqual([{ mode: "initial" }])
  })

  it("returns no hints for empty graph when type is not a starter", () => {
    const hints = listPaletteDropHints("image", [], [], 0)
    expect(hints).toEqual([])
  })

  it("returns after hint for nodes that accept the dragged type", () => {
    const text = wfNode("t", "text", 0, 0)
    const hints = listPaletteDropHints("image", [text], [], 0)
    expect(hints).toEqual([{ mode: "after", sourceId: "t" }])
  })

  it("returns between hint for edges that allow insert", () => {
    const k = wfNode("k", "keywords", 0, 100)
    const t = wfNode("t", "text", NODE_W + 80, 100)
    const hints = listPaletteDropHints(
      "intelligence",
      [k, t],
      [{ id: "e-1", source: "k", target: "t" }],
      0,
    )
    expect(hints).toContainEqual({ mode: "between", edgeId: "e-1" })
  })

  it("returns no hints when type cannot be placed anywhere", () => {
    const k = wfNode("k", "keywords", 0, 100)
    const hints = listPaletteDropHints("image", [k], [], 0)
    expect(hints).toEqual([])
  })
})

describe("paletteDropHintsMatch", () => {
  it("matches after hint to append target by sourceId", () => {
    const hint = { mode: "after" as const, sourceId: "t" }
    const target = { mode: "append" as const, sourceId: "t" }
    expect(paletteDropHintsMatch(hint, target)).toBe(true)
  })

  it("matches between hint to between target by edgeId", () => {
    const hint = { mode: "between" as const, edgeId: "e-1" }
    const target = { mode: "between" as const, edgeId: "e-1" }
    expect(paletteDropHintsMatch(hint, target)).toBe(true)
  })
})
