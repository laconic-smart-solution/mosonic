import { Plus } from "lucide-react"
import type { Node, NodeProps } from "@xyflow/react"

import {
  NODE_W,
  type PlusPlaceholderNodeData,
} from "@/features/workflow/data/workflow-model"
import { T } from "@/lib/tokens"

export function PlusPlaceholderNode({
  data,
}: NodeProps<Node<PlusPlaceholderNodeData, "plus_placeholder">>) {
  return (
    <button
      type="button"
      className="nodrag nopan pointer-events-auto flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed bg-card/80 px-6 py-10 transition-colors hover:border-[#00A589] hover:bg-[#E0FAF5]/40"
      style={{
        width: NODE_W,
        borderColor: T.surfaceBorder,
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
      <span className="text-center text-sm font-medium" style={{ color: T.textSecondary }}>
        Click to add your first node
      </span>
    </button>
  )
}
