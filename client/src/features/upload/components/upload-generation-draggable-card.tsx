import { useDraggable } from "@dnd-kit/core"
import { GripVertical, Loader2, RefreshCw } from "lucide-react"
import { useMemo, useState } from "react"

import { CreditUsageBadge } from "@/components/core/credit-usage-badge"
import { Button } from "@/components/ui/button"
import {
  mergeNodeOutputLayers,
  nodeDisplayTitle,
  outputKeyForNodeType,
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
  FileServiceImage,
  FileServiceVideo,
} from "@/features/upload/components/upload-display-media"
import {
  paletteDragIdForNode,
  palettePayloadForNode,
} from "@/features/upload/lib/upload-palette-drag"

type Props = {
  wfNode: WorkflowNode
  cardIndex: number
  nodeOutputs: Record<string, Record<string, unknown>>
  nodeUserEdits: Record<string, Record<string, unknown>>
  /** Flat merged outputs for fields not stored per-node. */
  flatEditedOutputs: Partial<Record<OutputKey, string | undefined>>
  run: CardRunState
  displayText: string
  globalRerunning: boolean
  blockPipeline: boolean
  onOpenRerun: (nodeId: string) => void
  onSubmitRerun: (nodeId: string) => void
  onRetry: () => void
  updateNodeUserEdit: (
    nodeId: string,
    key: OutputKey,
    value: string | undefined
  ) => void
  setRunState: (nodeId: string, partial: Partial<CardRunState>) => void
  setLightboxUrl: (url: string) => void
  uploadMediaForNode: (
    nodeId: string,
    kind: "image" | "video",
    file: File
  ) => void
  onCopyOutput: (text: string) => void
  creditsUsed?: number
}

export function UploadGenerationDraggableCard(props: Props) {
  const {
    wfNode,
    cardIndex,
    nodeOutputs,
    nodeUserEdits,
    flatEditedOutputs,
    run,
    displayText,
    globalRerunning,
    blockPipeline,
    onOpenRerun,
    onSubmitRerun,
    onRetry,
    updateNodeUserEdit,
    setRunState,
    setLightboxUrl,
    uploadMediaForNode,
    onCopyOutput,
    creditsUsed = 0,
  } = props

  const nodeId = wfNode.nodeId
  const key = outputKeyForNodeType(wfNode.type)

  const [expanded, setExpanded] = useState(false)

  const layer = useMemo(
    () => mergeNodeOutputLayers(nodeOutputs, nodeUserEdits, nodeId),
    [nodeOutputs, nodeUserEdits, nodeId]
  )

  const editedOutputsForCard = useMemo((): Partial<
    Record<OutputKey, string | undefined>
  > => {
    const scoped: Partial<Record<OutputKey, string | undefined>> = {
      ...flatEditedOutputs,
    }
    if (!key) return scoped
    if (key === "keywords" && typeof layer.keywords === "string")
      scoped.keywords = layer.keywords
    if (key === "text" && typeof layer.text === "string") scoped.text = layer.text
    if (
      wfNode.type === "adapt" &&
      typeof layer.adaptedCaption === "string"
    )
      scoped.text = layer.adaptedCaption
    if (key === "image" && typeof layer.image === "string")
      scoped.image = layer.image
    if (key === "translatedText" && typeof layer.translatedText === "string")
      scoped.translatedText = layer.translatedText
    if (key === "video" && typeof layer.video === "string") scoped.video = layer.video
    if (key === "transcription" && typeof layer.transcription === "string")
      scoped.transcription = layer.transcription
    if (key === "summary" && typeof layer.summary === "string")
      scoped.summary = layer.summary
    return scoped
  }, [flatEditedOutputs, key, layer])

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
      ? "ring-2 ring-primary/35"
      : run.phase === "error"
        ? "ring-2 ring-destructive/50"
        : ""

  const hasBodyOutput =
    key === "image"
      ? !!editedOutputsForCard.image
      : key === "video"
        ? !!editedOutputsForCard.video
        : isNonEmptyOutput(displayText)

  const payload = palettePayloadForNode(
    nodeId,
    wfNode.type,
    nodeOutputs,
    nodeUserEdits
  )
  const dragId = paletteDragIdForNode(nodeId)

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

  const lane =
    typeof wfNode.config?.laneId === "string" ? wfNode.config.laneId : null
  const title = nodeDisplayTitle(wfNode.type, lane)

  const thumbImage =
    typeof layer.image === "string" ? layer.image : undefined
  const thumbVideo =
    typeof layer.video === "string" ? layer.video : undefined

  if (!key) {
    return (
      <div className="rounded-lg border border-border bg-card px-3 py-2 text-[11px] text-muted-foreground">
        Unsupported node type: {wfNode.type}
      </div>
    )
  }

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
            title="This step has no draggable preview yet"
          >
            —
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold text-foreground">{title}</p>
            <CreditUsageBadge credits={creditsUsed} />
          </div>
          <p className="text-[10px] text-muted-foreground">
            Step {wfNode.order}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0 gap-1 px-2 text-[11px]"
          disabled={globalRerunning}
          onClick={() => onOpenRerun(nodeId)}
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
          ) : key === "image" && thumbImage ? (
            <div className="h-16 overflow-hidden rounded-md border bg-muted/30">
              <FileServiceImage
                url={thumbImage}
                alt=""
                className="size-full object-cover"
                loadingClassName="size-full min-h-16 text-[10px]"
              />
            </div>
          ) : key === "video" && thumbVideo ? (
            <div className="h-16 overflow-hidden rounded-md border bg-black">
              <FileServiceVideo
                url={thumbVideo}
                className="size-full object-cover"
                muted
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
            editedOutputs={editedOutputsForCard}
            globalRerunning={blockPipeline}
            displayText={displayText}
            hasBodyOutput={hasBodyOutput}
            isTextLike={isTextLike}
            highlight=""
            wfNode={wfNode}
            nodeId={nodeId}
            onCopyOutput={(t) => void onCopyOutput(t)}
            onOpenRerun={(_key: OutputKey) => {
              void _key
              onOpenRerun(nodeId)
            }}
            onSubmitRerun={(_key: OutputKey) => {
              void _key
              void onSubmitRerun(nodeId)
            }}
            onRetry={onRetry}
            updateOutput={(k, v) => updateNodeUserEdit(nodeId, k, v)}
            setRunState={(_k, partial) => setRunState(nodeId, partial)}
            setLightboxUrl={setLightboxUrl}
            uploadMedia={(kind, f) => uploadMediaForNode(nodeId, kind, f)}
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
