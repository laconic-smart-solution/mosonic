import { useDraggable } from "@dnd-kit/core"
import { GripVertical, PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { WF_NODE_TYPES } from "@/features/workflow/data/workflow-model"
import {
  getNodePopoverDescription,
  PLUS_POPOVER_TYPES,
  type PlusPopoverType,
} from "@/features/workflow/lib/workflow-node-validation"
import {
  paletteDragIdForType,
  type WorkflowPaletteDragPayload,
} from "@/features/workflow/lib/workflow-palette-dnd"
import { T } from "@/lib/tokens"
import { cn } from "@/lib/utils"

const PALETTE_TYPES: PlusPopoverType[] = [...PLUS_POPOVER_TYPES]

type PaletteRowProps = {
  wfType: PlusPopoverType
}

function PaletteRow({ wfType }: PaletteRowProps) {
  const { t } = useTranslation("workflow")
  const meta = WF_NODE_TYPES.find((t) => t.type === wfType)
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: paletteDragIdForType(wfType),
    data: { wfType } satisfies WorkflowPaletteDragPayload,
  })

  if (!meta) return null

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex cursor-grab items-start gap-2 rounded-lg border bg-card px-2.5 py-2 transition-shadow active:cursor-grabbing",
        isDragging && "opacity-50 shadow-md",
      )}
      style={{ borderColor: T.surfaceBorder }}
      {...attributes}
      {...listeners}
      aria-label={t("palette.dragAria", { label: meta.label })}
    >
      <GripVertical
        className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50"
        aria-hidden
      />
      <span
        className="mt-1 size-2 shrink-0 rounded-full"
        style={{ background: meta.color }}
      />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-foreground">
          {meta.label}
        </p>
        <p className="text-[10px] leading-snug text-muted-foreground">
          {getNodePopoverDescription(wfType)}
        </p>
      </div>
    </div>
  )
}

type WorkflowNodePalettePanelProps = {
  onCollapse?: () => void
}

export function WorkflowNodePalettePanel({
  onCollapse,
}: WorkflowNodePalettePanelProps) {
  const { t } = useTranslation("workflow")
  return (
    <aside
      className="flex h-full w-[240px] min-w-[240px] shrink-0 flex-col border-r bg-card"
      style={{ borderColor: T.surfaceBorder }}
    >
      <div
        className="shrink-0 border-b px-3 py-3"
        style={{ borderColor: T.surfaceBorder }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">
              {t("palette.title")}
            </h2>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {t("palette.subtitle")}
            </p>
          </div>
          {onCollapse ? (
            <button
              type="button"
              onClick={onCollapse}
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={t("palette.collapseAria")}
            >
              <PanelLeftClose className="size-4" />
            </button>
          ) : null}
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
        {PALETTE_TYPES.map((type) => (
          <PaletteRow key={type} wfType={type} />
        ))}
      </div>
    </aside>
  )
}

/** Collapsible nodes sidebar (plain aside — avoids Vaul blocking canvas clicks). */
export function WorkflowNodePalette() {
  const { t } = useTranslation("workflow")
  const [open, setOpen] = useState(true)

  return (
    <div className="flex h-full min-h-0 shrink-0">
      {open ? (
        <WorkflowNodePalettePanel onCollapse={() => setOpen(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-10 shrink-0 flex-col items-center gap-2 border-r bg-card py-4 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
          style={{ borderColor: T.surfaceBorder }}
          aria-label={t("palette.expandAria")}
        >
          <PanelLeftOpen className="size-4" />
          <span
            className="text-[9px] font-semibold tracking-wide uppercase"
            style={{ writingMode: "vertical-rl" }}
          >
            {t("palette.title")}
          </span>
        </button>
      )}
    </div>
  )
}

/** Compact preview shown while dragging from the palette. */
export function WorkflowPaletteDragPreview({ wfType }: { wfType: PlusPopoverType }) {
  const meta = WF_NODE_TYPES.find((t) => t.type === wfType)
  if (!meta) return null
  return (
    <div
      className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 shadow-lg"
      style={{ borderColor: T.surfaceBorder }}
    >
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ background: meta.color }}
      />
      <span className="text-xs font-semibold text-foreground">
        {meta.label}
      </span>
    </div>
  )
}
