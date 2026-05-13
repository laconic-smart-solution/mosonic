import { WF_NODE_TYPES } from "@/features/workflow/data/workflow-model"
import { T } from "@/lib/tokens"

type WorkflowPaletteProps = {
  hovPalette: number | null
  onHover: (i: number | null) => void
}

export function WorkflowPalette({ hovPalette, onHover }: WorkflowPaletteProps) {
  return (
    <div
      className="flex w-[208px] min-w-[208px] flex-col border-r bg-white"
      style={{ borderColor: T.surfaceBorder }}
    >
      <div className="border-b px-3.5 pt-3 pb-2" style={{ borderColor: T.surfaceBorder }}>
        <div className="text-[10px] font-bold tracking-wide text-[#718096] uppercase">Node Types</div>
        <div className="mt-1 text-[11px] leading-relaxed text-[#718096]">Drag onto canvas</div>
      </div>
      <div className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
        {WF_NODE_TYPES.map((nt, i) => (
          <div
            key={nt.type}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("application/reactflow", JSON.stringify({ wfType: nt.type }))
              e.dataTransfer.effectAllowed = "move"
            }}
            onMouseEnter={() => onHover(i)}
            onMouseLeave={() => onHover(null)}
            className="flex cursor-grab items-center gap-2 rounded-lg border p-2.5 transition-all duration-150"
            style={{
              borderColor: hovPalette === i ? `${nt.color}40` : T.surfaceBorder,
              background: hovPalette === i ? nt.bg : "#FDFCFA",
              boxShadow: hovPalette === i ? `0 2px 8px ${nt.color}15` : "none",
            }}
          >
            <div
              className="flex size-7 shrink-0 items-center justify-center rounded-md border-[1.5px]"
              style={{ background: nt.bg, borderColor: `${nt.color}40`, color: nt.color }}
            >
              {nt.icon}
            </div>
            <div className="min-w-0">
              <div className="text-[11px] leading-snug font-semibold" style={{ color: T.textPrimary }}>
                {nt.label}
              </div>
              <div className="mt-px text-[9px] text-[#718096]">
                {nt.type === "keywords" || nt.type === "text" ? "Required (one)" : "Drag to add"}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="m-2 rounded-lg border border-[#FCD34D] bg-[#FFFBEB] p-2.5">
        <div className="text-[10px] leading-relaxed font-medium text-[#D97706]">
          💡 Drag a node type onto the canvas. Connect outputs to inputs to build a linear pipeline (one
          link in, one out per node).
        </div>
      </div>
    </div>
  )
}
