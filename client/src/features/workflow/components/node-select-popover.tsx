import { useEffect, useRef } from "react"

import { WF_NODE_TYPES } from "@/features/workflow/data/workflow-model"
import {
  NODE_POPOVER_DESCRIPTIONS,
  type PlusPopoverType,
} from "@/features/workflow/lib/workflow-node-validation"
import { T } from "@/lib/tokens"

export type NodeSelectPopoverProps = {
  open: boolean
  anchorPosition: { x: number; y: number }
  validNodeTypes: PlusPopoverType[]
  onSelect: (nodeType: PlusPopoverType) => void
  onClose: () => void
}

export function NodeSelectPopover({
  open,
  anchorPosition,
  validNodeTypes,
  onSelect,
  onClose,
}: NodeSelectPopoverProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    const onOutsideClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose()
      }
    }
    window.addEventListener("keydown", onKey)
    // Defer so the same click that opened the popover does not immediately close it.
    const timer = window.setTimeout(() => {
      window.addEventListener("click", onOutsideClick, true)
    }, 0)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("click", onOutsideClick, true)
    }
  }, [open, onClose])

  if (!open || validNodeTypes.length === 0) return null

  return (
    <div
      ref={ref}
      role="listbox"
      className="fixed z-50 min-w-[240px] origin-top-left animate-in fade-in zoom-in-95 rounded-xl border bg-white p-1.5 shadow-lg duration-150"
      style={{
        left: anchorPosition.x,
        top: anchorPosition.y,
        borderColor: T.surfaceBorder,
        animationDuration: "150ms",
      }}
    >
      {validNodeTypes.map((type) => {
        const meta = WF_NODE_TYPES.find((t) => t.type === type)
        if (!meta) return null
        return (
          <button
            key={type}
            type="button"
            role="option"
            className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-gray-50"
            onClick={() => {
              onSelect(type)
              onClose()
            }}
          >
            <span
              className="mt-0.5 size-2.5 shrink-0 rounded-full"
              style={{ background: meta.color }}
            />
            <span className="min-w-0 flex-1">
              <span
                className="block text-sm font-semibold"
                style={{ color: T.textPrimary }}
              >
                {meta.label}
              </span>
              <span
                className="mt-0.5 block text-xs leading-snug"
                style={{ color: T.textSecondary }}
              >
                {NODE_POPOVER_DESCRIPTIONS[type]}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
