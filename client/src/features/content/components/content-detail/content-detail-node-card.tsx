import { motion } from "framer-motion"
import {
  Copy,
  ImageIcon,
  Pencil,
  RefreshCw,
  Video,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  type OutputKey,
  cardTitle,
} from "@/features/content/data/content-review-helpers"
import { cn } from "@/lib/utils"
import type { WorkflowNode } from "@/shared/types/workflow.type"
import { PreviewImageWithOverlay, MediaVideoBlock, type CardRunState } from "./content-detail-review-ui"

export type ContentDetailNodeCardProps = {
  nodeKey: OutputKey
  cardIndex: number
  run: CardRunState
  editedOutputs: Partial<Record<OutputKey, string | undefined>>
  globalRerunning: boolean
  displayText: string
  hasBodyOutput: boolean
  isTextLike: boolean
  highlight: string
  wfNode: WorkflowNode | undefined
  nodeId: string | undefined
  onCopyOutput: (text: string) => void
  onOpenRerun: (key: OutputKey) => void
  onSubmitRerun: (key: OutputKey) => void
  updateOutput: (key: OutputKey, value: string | undefined) => void
  setRunState: (key: OutputKey, partial: Partial<CardRunState>) => void
  setLightboxUrl: (url: string) => void
  uploadMedia: (key: "image" | "video", file: File) => void
  /** When set, error-state Retry uses this (e.g. synthetic generate-more vs re-run). */
  onRetry?: () => void | Promise<void>
}

export function ContentDetailNodeCard(props: ContentDetailNodeCardProps) {
  const {
    nodeKey: key,
    cardIndex,
    run,
    editedOutputs,
    globalRerunning,
    displayText,
    isTextLike,
    highlight,
    nodeId,
    onCopyOutput,
    onOpenRerun,
    onSubmitRerun,
    updateOutput,
    setRunState,
    setLightboxUrl,
    uploadMedia,
    onRetry,
  } = props

  const interactionsLocked =
    globalRerunning ||
    run.phase === "running" ||
    run.phase === "streaming" ||
    run.phase === "processing" ||
    run.phase === "retrying"

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay: Math.min(cardIndex, 10) * 0.05 }}
      className={cn("overflow-hidden", highlight)}
    >
      <div className="space-y-3 px-[18px] py-[18px]">
        {run.phase === "running" && !run.stream && (
          <p className="text-xs text-primary">Generating…</p>
        )}
        {run.phase === "processing" && run.processingMessage && (
          <p className="text-xs text-primary">{run.processingMessage}</p>
        )}
        {run.phase === "retrying" && run.retryLabel && (
          <p className="text-xs text-amber-800">{run.retryLabel}</p>
        )}
        {run.phase === "error" && run.errorMessage && (
          <div className="space-y-2">
            <p className="text-xs text-red-600">{run.errorMessage}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => void (onRetry ? onRetry() : onSubmitRerun(key))}
            >
              Retry
            </Button>
          </div>
        )}

        {key === "translatedText" ? (
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
              TH
            </span>
            <span className="text-[11px] text-muted-foreground">Target language</span>
          </div>
        ) : null}

        {isTextLike ? (
          <>
            <Textarea
              value={displayText}
              disabled={interactionsLocked}
              onChange={(e) => {
                updateOutput(key, e.target.value)
                if (run.stream) {
                  setRunState(key, {
                    phase: "idle",
                    stream: "",
                  })
                }
              }}
              className="min-h-[120px] resize-y border-0 bg-transparent px-1 py-1 text-sm leading-relaxed text-foreground shadow-none placeholder:text-muted-foreground focus-visible:bg-muted/30 focus-visible:ring-2 focus-visible:ring-primary/40"
            />
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Pencil className="size-3 shrink-0" />
              Edit directly; save from the sidebar.
            </p>
          </>
        ) : null}

        {key === "image" && (
          <div className="space-y-2">
            {editedOutputs.image ? (
              <PreviewImageWithOverlay
                url={editedOutputs.image}
                title={cardTitle(key)}
                onOpen={() => setLightboxUrl(editedOutputs.image!)}
                onRemove={() => updateOutput("image", undefined)}
              />
            ) : (
              <label
                className={cn(
                  "flex flex-col items-center justify-center rounded-[10px] border-2 border-dashed border-border py-7 text-center text-[13px] text-muted-foreground transition-colors",
                  interactionsLocked
                    ? "cursor-not-allowed opacity-50"
                    : "cursor-pointer hover:border-primary hover:bg-primary/10 hover:text-primary",
                )}
              >
                <ImageIcon className="mb-2 size-7 opacity-70" />
                <input
                  type="file"
                  accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                  className="hidden"
                  disabled={interactionsLocked}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ""
                    if (f) void uploadMedia("image", f)
                  }}
                />
                Drop or click to upload (JPG, PNG)
              </label>
            )}
          </div>
        )}

        {key === "video" && (
          <div className="space-y-2">
            {editedOutputs.video ? (
              <div className="overflow-hidden rounded-[10px] border border-border">
                <MediaVideoBlock url={editedOutputs.video} />
              </div>
            ) : (
              <label
                className={cn(
                  "flex flex-col items-center justify-center rounded-[10px] border-2 border-dashed border-border py-7 text-center text-[13px] text-muted-foreground transition-colors",
                  interactionsLocked
                    ? "cursor-not-allowed opacity-50"
                    : "cursor-pointer hover:border-primary hover:bg-primary/10 hover:text-primary",
                )}
              >
                <Video className="mb-2 size-7 opacity-70" />
                <input
                  type="file"
                  accept="video/mp4,.mp4"
                  className="hidden"
                  disabled={interactionsLocked}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ""
                    if (f) void uploadMedia("video", f)
                  }}
                />
                Drop or click to upload (MP4)
              </label>
            )}
          </div>
        )}

        <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-border pt-3.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 border-border bg-transparent text-xs text-muted-foreground hover:bg-muted"
            disabled={!nodeId || interactionsLocked}
            onClick={() => onOpenRerun(key)}
          >
            <RefreshCw className="mr-1.5 size-3" />
            Re-run node
          </Button>
          <div className="ml-auto flex flex-wrap gap-2">
            {isTextLike ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 border-border bg-transparent text-xs text-muted-foreground hover:bg-muted"
                disabled={!displayText.trim()}
                onClick={() => onCopyOutput(displayText)}
              >
                <Copy className="mr-1.5 size-3" />
                Copy
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
