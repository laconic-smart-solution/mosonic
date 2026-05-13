import { useDraggable } from "@dnd-kit/core"
import { GripVertical, Loader2, RefreshCw } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  cardTitle,
  type OutputKey,
} from "@/features/content/data/content-review-helpers"
import { ContentDetailNodeCard } from "@/features/content/components/content-detail/content-detail-node-card"
import {
  isNonEmptyOutput,
  type CardRunState,
} from "@/features/content/components/content-detail/content-detail-review-ui"
import type { WorkflowNode } from "@/shared/types/workflow.type"
import { cn } from "@/lib/utils"

import {
  paletteDragIdForKey,
  palettePayloadForKey,
} from "@/features/upload/lib/upload-palette-drag"

type Props = {
  nodeKey: OutputKey
  cardIndex: number
  editedOutputs: Partial<Record<OutputKey, string | undefined>>
  run: CardRunState
  displayText: string
  globalRerunning: boolean
  blockPipeline: boolean
  wfNode: WorkflowNode | undefined
  nodeId: string | undefined
  onOpenRerun: (key: OutputKey) => void
  onSubmitRerun: (key: OutputKey) => void
  onRetry: () => void
  updateOutput: (key: OutputKey, value: string | undefined) => void
  setRunState: (key: OutputKey, partial: Partial<CardRunState>) => void
  setLightboxUrl: (url: string) => void
  uploadMedia: (key: "image" | "video", file: File) => void
  onCopyOutput: (text: string) => void
}

export function UploadGenerationDraggableCard(props: Props) {
  const {
    nodeKey: key,
    cardIndex,
    editedOutputs,
    run,
    displayText,
    globalRerunning,
    blockPipeline,
    wfNode,
    nodeId,
    onOpenRerun,
    onSubmitRerun,
    onRetry,
    updateOutput,
    setRunState,
    setLightboxUrl,
    uploadMedia,
    onCopyOutput,
  } = props

  const [expanded, setExpanded] = useState(false)

  const isTextLike =
    key === "text" ||
    key === "translatedText" ||
    key === "transcription" ||
    key === "summary"

  const highlight =
    run.phase === "running" ||
    run.phase === "streaming" ||
    run.phase === "processing" ||
    run.phase === "retrying"
      ? "ring-2 ring-[#00C9A7]/35"
      : run.phase === "error"
        ? "ring-2 ring-red-400/70"
        : ""

  const hasBodyOutput =
    key === "image"
      ? !!editedOutputs.image
      : key === "video"
        ? !!editedOutputs.video
        : isNonEmptyOutput(displayText)

  const payload = palettePayloadForKey(key, editedOutputs)
  const dragId = paletteDragIdForKey(key)

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dragId,
    data: payload ?? undefined,
    disabled: !payload,
  })

  const showStreaming =
    run.phase === "streaming" ||
    run.phase === "running" ||
    run.phase === "processing" ||
    run.phase === "retrying"

  return (
    <div
      ref={setNodeRef}
      style={{ opacity: isDragging ? 0.5 : 1 }}
      className={cn(
        "rounded-lg border border-border bg-card shadow-sm transition-shadow",
        highlight,
        payload ? "" : "opacity-95",
      )}
    >
      <div className="flex items-start gap-2 border-b border-border/80 px-2 py-2">
        {payload ? (
          <button
            type="button"
            className="mt-0.5 flex shrink-0 cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing"
            aria-label="Drag to preview"
            {...listeners}
            {...attributes}
          >
            <GripVertical className="size-4" />
          </button>
        ) : (
          <span
            className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center text-[10px] text-muted-foreground"
            title="Transcript cannot be used as a caption drag source"
          >
            —
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-foreground">{cardTitle(key)}</p>
          {wfNode ? (
            <p className="text-[10px] text-muted-foreground">
              Step {wfNode.order}
            </p>
          ) : null}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0 gap-1 px-2 text-[11px]"
          disabled={!nodeId || globalRerunning}
          onClick={() => onOpenRerun(key)}
        >
          {showStreaming ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          Rerun
        </Button>
      </div>

      {!expanded ? (
        <div className="space-y-2 px-3 py-2.5">
          {run.phase === "error" && run.errorMessage ? (
            <p className="text-[11px] text-red-600">{run.errorMessage}</p>
          ) : null}
          {isTextLike ? (
            <p className="line-clamp-3 whitespace-pre-wrap text-[11px] leading-snug text-muted-foreground">
              {displayText || "—"}
            </p>
          ) : key === "image" && editedOutputs.image ? (
            <div className="h-16 overflow-hidden rounded-md border bg-muted/30">
              <img
                src={editedOutputs.image}
                alt=""
                className="size-full object-cover"
              />
            </div>
          ) : key === "video" && editedOutputs.video ? (
            <div className="h-16 overflow-hidden rounded-md border bg-black">
              <video
                src={editedOutputs.video}
                className="size-full object-cover"
                muted
                playsInline
              />
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">No output yet.</p>
          )}
          <button
            type="button"
            className="text-[11px] font-medium text-primary hover:underline"
            onClick={() => setExpanded(true)}
          >
            See more
          </button>
        </div>
      ) : (
        <div className="border-t border-border/60">
          <ContentDetailNodeCard
            nodeKey={key}
            cardIndex={cardIndex}
            run={run}
            editedOutputs={editedOutputs}
            globalRerunning={blockPipeline}
            displayText={displayText}
            hasBodyOutput={hasBodyOutput}
            isTextLike={isTextLike}
            highlight=""
            wfNode={wfNode}
            nodeId={nodeId}
            onCopyOutput={(t) => void onCopyOutput(t)}
            onOpenRerun={onOpenRerun}
            onSubmitRerun={onSubmitRerun}
            onRetry={onRetry}
            updateOutput={updateOutput}
            setRunState={setRunState}
            setLightboxUrl={setLightboxUrl}
            uploadMedia={uploadMedia}
          />
          <div className="px-3 pb-2">
            <button
              type="button"
              className="text-[11px] font-medium text-primary hover:underline"
              onClick={() => setExpanded(false)}
            >
              See less
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
