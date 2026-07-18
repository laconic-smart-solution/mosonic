import { useEffect, useRef, useState } from "react"
import { useDroppable } from "@dnd-kit/core"
import { AlignLeft, GripVertical, X } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type { UploadResolvedOutputs } from "@/shared/types/upload.type"

import {
  effectiveCaptionForDraft,
  type ChannelDraft,
  type WorkflowNodeLayersSnapshot,
} from "@/features/upload/lib/upload-channel-draft"

import type { UploadPaletteDragPayload } from "./upload-dnd-payload"

type DropVisual = "idle" | "accept" | "reject"

type UploadTextDropZoneProps = {
  draft: ChannelDraft
  resolved: UploadResolvedOutputs
  workflowLayers?: WorkflowNodeLayersSnapshot | null
  captionSourceLabel: string
  /** When set (e.g. TikTok photo slideshow), show a character counter and warn over limit. */
  captionMaxLength?: number
  captionLimitHint?: string
  activeDrag: UploadPaletteDragPayload | null
  disabled?: boolean
  onCaptionChange: (next: string) => void
  onClear: () => void
}

/** Collapsed preview ~4 lines of text-xs (leading-relaxed ≈ 1.625). */
const COLLAPSED_MAX_PX = 88

function textDropVisual(active: UploadPaletteDragPayload | null): DropVisual {
  if (!active) return "idle"
  return active.kind === "text" ? "accept" : "reject"
}

export function UploadTextDropZone({
  draft,
  resolved,
  workflowLayers = null,
  captionSourceLabel,
  captionMaxLength,
  captionLimitHint,
  activeDrag,
  disabled = false,
  onCaptionChange,
  onClear,
}: UploadTextDropZoneProps) {
  const { t } = useTranslation("upload")
  const visual = textDropVisual(disabled ? null : activeDrag)
  const { isOver, setNodeRef } = useDroppable({ id: "drop-text", disabled })
  const caption = effectiveCaptionForDraft(draft, resolved, workflowLayers)
  const has = caption.trim().length > 0
  const captionLen = caption.length
  const overCaptionLimit =
    captionMaxLength != null && captionLen > captionMaxLength

  const [expanded, setExpanded] = useState(false)
  const [canExpand, setCanExpand] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setExpanded(false)
  }, [draft.captionSource, draft.captionSourceNodeId])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return

    el.style.height = "auto"
    const fullHeight = el.scrollHeight
    setCanExpand(fullHeight > COLLAPSED_MAX_PX + 1)

    if (expanded || !has) {
      el.style.height = `${Math.max(fullHeight, 64)}px`
      el.style.overflowY = "hidden"
      return
    }

    el.style.height = `${Math.min(fullHeight, COLLAPSED_MAX_PX)}px`
    el.style.overflowY = "hidden"
  }, [caption, expanded, has])

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
        border,
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
        ref={textareaRef}
        value={caption}
        onChange={(e) => onCaptionChange(e.target.value)}
        onFocus={() => {
          if (canExpand) setExpanded(true)
        }}
        placeholder="Type or drag generated text here"
        disabled={disabled}
        className={cn(
          "min-h-0 resize-none overflow-hidden text-xs leading-relaxed",
          "max-h-none pr-10",
        )}
        aria-label="Caption text"
        aria-expanded={canExpand ? expanded : undefined}
      />
      {canExpand || expanded ? (
        <button
          type="button"
          className="mt-1.5 text-[11px] font-medium text-primary hover:underline"
          onClick={() => setExpanded((prev) => !prev)}
        >
          {expanded ? t("editor.seeLess") : t("editor.seeMore")}
        </button>
      ) : null}
      {isOver && visual === "reject" ? (
        <p className="mt-2 text-center text-[11px] text-destructive">
          Text items only
        </p>
      ) : null}
      {captionMaxLength != null ? (
        <div className="mt-2 space-y-1">
          {captionLimitHint ? (
            <p className="text-[10px] leading-snug text-muted-foreground">
              {captionLimitHint}
            </p>
          ) : null}
          <p
            className={cn(
              "text-right text-[10px] tabular-nums",
              overCaptionLimit
                ? "font-medium text-destructive"
                : "text-muted-foreground",
            )}
          >
            {captionLen} / {captionMaxLength}
          </p>
        </div>
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
