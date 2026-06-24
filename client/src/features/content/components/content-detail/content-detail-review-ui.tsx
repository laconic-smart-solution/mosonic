import type { ReactNode } from "react"
import {
  Check,
  Clock,
  FileText,
  Hash,
  ImageIcon,
  Languages,
  ListOrdered,
  Mic,
  Trash2,
  Video,
} from "lucide-react"
import i18n from "@/i18n"
import type { WorkflowNodeType } from "@/shared/types/workflow.type"
import { Button } from "@/components/ui/button"
import { MediaLoadPlaceholder } from "@/shared/components/media-load-placeholder"
import { useFileObjectUrl } from "@/shared/hooks/use-file-object-url"
import {
  OUTPUT_GRID,
  type OutputKey,
  resolveNodeId,
} from "@/features/content/data/content-review-helpers"

export const CARD_ICONS: Record<OutputKey, ReactNode> = {
  keywords: <Hash className="size-4" />,
  text: <FileText className="size-4" />,
  translatedText: <Languages className="size-4" />,
  image: <ImageIcon className="size-4" />,
  video: <Video className="size-4" />,
  transcription: <Mic className="size-4" />,
  summary: <ListOrdered className="size-4" />,
}

export function isNonEmptyOutput(v: string | undefined): boolean {
  return v != null && String(v).trim() !== ""
}

export function outputKeyForNodeId(
  nodes: Array<{ nodeId: string; type: string; order: number }>,
  nodeId: string,
): OutputKey | undefined {
  for (const row of OUTPUT_GRID) {
    for (const k of row) {
      if (
        resolveNodeId(nodes as Parameters<typeof resolveNodeId>[0], k) ===
        nodeId
      ) {
        return k
      }
    }
  }
  return undefined
}

export type CardRunPhase =
  | "idle"
  | "running"
  | "streaming"
  | "processing"
  | "retrying"
  | "error"

export type CardRunState = {
  phase: CardRunPhase
  stream: string
  processingMessage: string
  retryLabel: string
  errorMessage: string
}

export const emptyRunState = (): CardRunState => ({
  phase: "idle",
  stream: "",
  processingMessage: "",
  retryLabel: "",
  errorMessage: "",
})

export function nodeIconBoxClass(key: OutputKey): string {
  if (key === "image") return "bg-[#E0FAF5] text-[#00806B]"
  if (key === "video") return "bg-[#FEF6E4] text-[#7C4F07]"
  return "bg-[#E8EDF6] text-[#1A3260]"
}

export function pipelineStepLabel(type: WorkflowNodeType): string {
  return i18n.t(`content:nodeType.${type}`, { defaultValue: type })
}

export function PipelineTypeIcon({ type }: { type: WorkflowNodeType }) {
  const ic = "size-[13px] shrink-0 text-[#00A589]"
  switch (type) {
    case "keyword_planner":
      return <Hash className={ic} />
    case "text_generation":
      return <FileText className={ic} />
    case "image_generation":
      return <ImageIcon className={ic} />
    case "translation":
      return <Languages className={ic} />
    case "video_generation":
      return <Video className={ic} />
    case "transcription":
      return <Mic className={ic} />
    case "summarization":
      return <ListOrdered className={ic} />
    default:
      return <FileText className={ic} />
  }
}

export function PreviewImageWithOverlay({
  url,
  title,
  onOpen,
  onRemove,
}: {
  url: string
  title: string
  onOpen: () => void
  onRemove: () => void
}) {
  const media = useFileObjectUrl(url)
  if (media.status !== "ready" || !media.src) {
    return (
      <div className="flex min-h-[120px] w-full items-center justify-center rounded-[10px] border border-border bg-muted/30">
        <MediaLoadPlaceholder
          className="w-full py-6"
          progress={media.progress}
          status={media.status === "error" ? "error" : "loading"}
          kind="image"
        />
      </div>
    )
  }
  return (
    <div className="group relative w-full overflow-hidden rounded-[10px] border border-border bg-muted/30">
      <button
        type="button"
        className="block w-full border-0 p-0"
        onClick={onOpen}
      >
        <img
          src={media.src}
          alt={title}
          className="max-h-[min(420px,60vh)] w-full object-contain"
        />
      </button>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 bg-foreground/40 opacity-0 transition-opacity group-hover:opacity-100">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="pointer-events-auto bg-card/90 text-foreground shadow-sm hover:bg-card"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
        >
          <Trash2 className="mr-1 size-3.5" />
          {i18n.t("content:review.remove")}
        </Button>
      </div>
    </div>
  )
}

export function NodeOutputBadge({
  run,
  hasOutput,
}: {
  run: CardRunState
  hasOutput: boolean
}) {
  if (run.phase === "error") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-red-700 uppercase">
        {i18n.t("content:review.badgeError")}
      </span>
    )
  }
  if (
    run.phase === "running" ||
    run.phase === "streaming" ||
    run.phase === "processing" ||
    run.phase === "retrying"
  ) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200/80 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-amber-800 uppercase">
        <Clock className="size-3 shrink-0" />
        {i18n.t("content:review.badgeWorking")}
      </span>
    )
  }
  if (hasOutput) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(0,201,167,0.25)] bg-[#E0FAF5] px-2 py-0.5 text-[11px] font-semibold tracking-wide text-[#005C4D] uppercase">
        <Check className="size-3 shrink-0" />
        {i18n.t("content:review.badgeGenerated")}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200/80 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-amber-800 uppercase">
      <Clock className="size-3 shrink-0" />
      {i18n.t("content:review.badgeEmpty")}
    </span>
  )
}

export function MediaVideoBlock({ url }: { url: string }) {
  const media = useFileObjectUrl(url)
  if (media.status !== "ready" || !media.src) {
    return (
      <div className="flex min-h-[160px] w-full items-center justify-center rounded-lg bg-muted/30">
        <MediaLoadPlaceholder
          className="w-full py-8"
          progress={media.progress}
          status={media.status === "error" ? "error" : "loading"}
          kind="video"
        />
      </div>
    )
  }
  return (
    <video
      src={media.src}
      controls
      className="max-h-[min(420px,60vh)] w-full rounded-lg bg-black object-contain"
      autoPlay
      muted
      playsInline
    />
  )
}

export function LightboxInner({ url }: { url: string }) {
  const media = useFileObjectUrl(url)
  if (media.status !== "ready" || !media.src) {
    return (
      <MediaLoadPlaceholder
        className="min-h-[40vh] w-full py-12"
        progress={media.progress}
        status={media.status === "error" ? "error" : "loading"}
        kind="image"
      />
    )
  }
  return (
    <img src={media.src} alt="" className="max-h-[80vh] w-full object-contain" />
  )
}
