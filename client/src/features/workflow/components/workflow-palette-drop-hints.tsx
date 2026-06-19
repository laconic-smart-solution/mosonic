import { useMemo } from "react"
import { useReactFlow, ViewportPortal } from "@xyflow/react"

import {
  NODE_H,
  NODE_W,
  PIPE_GAP,
  type WfRfNode,
} from "@/features/workflow/data/workflow-model"
import {
  afterSourceIdFromTarget,
  type PaletteDropHint,
  type PaletteDropTarget,
} from "@/features/workflow/lib/workflow-palette-dnd"

type WorkflowPaletteDropHintsProps = {
  hints: PaletteDropHint[]
  activeTarget: PaletteDropTarget | null
  nodes: WfRfNode[]
}

function afterSlotPosition(source: WfRfNode): { x: number; y: number } {
  return {
    x: source.position.x + NODE_W + PIPE_GAP,
    y: source.position.y,
  }
}

export function WorkflowPaletteDropHints({
  hints,
  activeTarget,
  nodes,
}: WorkflowPaletteDropHintsProps) {
  const { getNode } = useReactFlow()

  const afterHints = useMemo(
    () => hints.filter((h): h is { mode: "after"; sourceId: string } => h.mode === "after"),
    [hints],
  )

  const activeAfterSourceId = afterSourceIdFromTarget(activeTarget)

  if (afterHints.length === 0) return null

  return (
    <ViewportPortal>
      <div className="pointer-events-none absolute inset-0 overflow-visible">
        {afterHints.map((hint) => {
          const source = getNode(hint.sourceId) ?? nodes.find((n) => n.id === hint.sourceId)
          if (!source) return null

          const slot = afterSlotPosition(source as WfRfNode)
          const isActive = activeAfterSourceId === hint.sourceId

          return (
            <div
              key={`after-slot-${hint.sourceId}`}
              className={`nodrag nopan absolute rounded-xl border-2 border-dashed transition-all duration-150 ${
                isActive
                  ? "animate-pulse border-[#00A589] bg-[#E0FAF5]/50 shadow-[0_0_0_4px_rgba(0,165,137,0.25)] dark:border-teal-400 dark:bg-teal-950/40 dark:shadow-[0_0_0_4px_rgba(45,212,191,0.2)]"
                  : "border-[#00A589]/70 bg-[#E0FAF5]/30 dark:border-teal-400/70 dark:bg-teal-950/25"
              }`}
              style={{
                left: slot.x,
                top: slot.y,
                width: NODE_W,
                height: NODE_H,
              }}
            />
          )
        })}
      </div>
    </ViewportPortal>
  )
}
