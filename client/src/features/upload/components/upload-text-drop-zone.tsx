import { useDroppable } from "@dnd-kit/core"
import { AlignLeft, GripVertical, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type { UploadResolvedOutputs } from "@/shared/types/upload.type"

import {
  effectiveCaptionForDraft,
  type ChannelDraft,
} from "@/features/upload/lib/upload-channel-draft"

import type { UploadPaletteDragPayload } from "./upload-dnd-payload"

type DropVisual = "idle" | "accept" | "reject"

type UploadTextDropZoneProps = {
  draft: ChannelDraft
  resolved: UploadResolvedOutputs
  captionSourceLabel: string
  activeDrag: UploadPaletteDragPayload | null
  disabled?: boolean
  onCaptionChange: (next: string) => void
  onClear: () => void
}

function textDropVisual(active: UploadPaletteDragPayload | null): DropVisual {
  if (!active) return "idle"
  return active.kind === "text" ? "accept" : "reject"
}

export function UploadTextDropZone({
  draft,
  resolved,
  captionSourceLabel,
  activeDrag,
  disabled = false,
  onCaptionChange,
  onClear,
}: UploadTextDropZoneProps) {
  const visual = textDropVisual(disabled ? null : activeDrag)
  const { isOver, setNodeRef } = useDroppable({ id: "drop-text", disabled })
  const caption = effectiveCaptionForDraft(draft, resolved)
  const has = caption.trim().length > 0

  const border =
    isOver && visual === "accept"
      ? "border-[#1D9E75] bg-[#1D9E75]/10"
      : isOver && visual === "reject"
        ? "border-destructive bg-destructive/10"
        : has
          ? "border-border bg-card"
          : "border-dashed border-border bg-muted/30"

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group relative min-h-[88px] rounded-md border-[1.5px] p-3 transition-colors",
        border
      )}
    >
      <div className="mb-2 flex items-center gap-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        <AlignLeft className="size-3.5" aria-hidden />
        Caption / text
      </div>
      <p className="mb-2 flex items-center gap-1 text-[10px] text-muted-foreground">
        <GripVertical className="size-3 shrink-0 opacity-50" aria-hidden />
        {disabled
          ? "Scheduled posts can be edited from the scheduled edit panel"
          : "Drag from Generated contents or type below"}
      </p>
      {has ? (
        <p className="mb-2 inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2 py-0.5 text-[10px] text-muted-foreground">
          {captionSourceLabel}
        </p>
      ) : null}
      <Textarea
        value={caption}
        onChange={(e) => onCaptionChange(e.target.value)}
        placeholder="Type or drag generated text here"
        disabled={disabled}
        className={cn(
          "min-h-[100px] resize-y text-xs leading-relaxed",
          "pr-10"
        )}
        aria-label="Caption text"
      />
      {isOver && visual === "reject" ? (
        <p className="mt-2 text-center text-[11px] text-destructive">
          Text items only
        </p>
      ) : null}
      {has && !disabled ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute top-9 right-2 size-7 rounded-full border bg-background opacity-0 transition-opacity group-hover:opacity-100 hover:opacity-100"
          onClick={onClear}
          aria-label="Reset caption source"
        >
          <X className="size-3.5" />
        </Button>
      ) : null}
    </div>
  )
}
