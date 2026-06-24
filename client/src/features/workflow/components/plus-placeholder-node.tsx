import { Plus } from "lucide-react"
import type { Node, NodeProps } from "@xyflow/react"

import {
  NODE_W,
  type PlusPlaceholderNodeData,
} from "@/features/workflow/data/workflow-model"
import { T } from "@/lib/tokens"

export type PlusPlaceholderNodeDataWithHighlight = PlusPlaceholderNodeData & {
  paletteDropHighlight?: boolean
}

export function PlusPlaceholderNode({
  data,
}: NodeProps<Node<PlusPlaceholderNodeDataWithHighlight, "plus_placeholder">>) {
  const highlighted = Boolean(data.paletteDropHighlight)

  return (
    <button
      type="button"
      className={`nodrag nopan pointer-events-auto flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed bg-card/80 px-6 py-10 transition-colors hover:border-[#00A589] hover:bg-[#E0FAF5]/40 dark:hover:border-teal-400 dark:hover:bg-teal-950/30 ${
        highlighted
          ? "animate-pulse border-[#00A589] bg-[#E0FAF5]/40 shadow-[0_0_0_4px_rgba(0,165,137,0.25)] dark:border-teal-400 dark:bg-teal-950/35 dark:shadow-[0_0_0_4px_rgba(45,212,191,0.2)]"
          : ""
      }`}
      style={{
        width: NODE_W,
        borderColor: highlighted ? "#00A589" : T.surfaceBorder,
      }}
      onPointerDown={(event) => {
        event.stopPropagation()
      }}
      onClick={(event) => {
        event.stopPropagation()
        data.onOpenPopover?.(event)
      }}
    >
      <div
        className="mb-3 flex size-12 items-center justify-center rounded-full border-2 border-dashed"
        style={{ borderColor: "#00A589", color: "#00A589" }}
      >
        <Plus size={28} strokeWidth={2} />
      </div>
      <span className="text-center text-sm font-medium text-muted-foreground">
        Click to add your first node
      </span>
    </button>
  )
}
