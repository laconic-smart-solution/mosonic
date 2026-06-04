import type { ReactNode } from "react"
import { useDraggable } from "@dnd-kit/core"
import { AlignLeft, ImageIcon, List, Languages, Video } from "lucide-react"

import { cn } from "@/lib/utils"
import type { UploadResolvedOutputs } from "@/shared/types/upload.type"

import { FileServiceImage, FileServiceVideo } from "./upload-display-media"
import type { UploadPaletteDragPayload } from "./upload-dnd-payload"

/** Rendered inside `DragOverlay` so the preview is not clipped by scroll parents. */
export function UploadPaletteDragPreview({
  payload,
  resolved,
}: {
  payload: UploadPaletteDragPayload
  resolved: UploadResolvedOutputs
}) {
  if (payload.kind === "text") {
    const text =
      payload.source === "text"
        ? resolved.text
        : payload.source === "translatedText"
          ? resolved.translatedText
          : resolved.summary
    const label =
      payload.source === "text"
        ? "Text"
        : payload.source === "translatedText"
          ? "Translation"
          : "Summary"
    const Icon =
      payload.source === "text"
        ? AlignLeft
        : payload.source === "translatedText"
          ? Languages
          : List
    return (
      <div
        className={cn(
          "w-[min(280px,calc(100vw-2rem))] cursor-grabbing rounded-md border border-border bg-card px-3 py-2.5 shadow-lg",
          "ring-2 ring-border/60"
        )}
      >
        <div className="mb-1 flex items-center gap-1.5 text-xs font-medium">
          <Icon className="size-3.5 shrink-0 text-muted-foreground" />
          {label}
        </div>
        {text?.trim() ? (
          <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
            {text}
          </p>
        ) : null}
      </div>
    )
  }

  if (payload.kind === "image") {
    return (
      <div
        className={cn(
          "w-[min(280px,calc(100vw-2rem))] cursor-grabbing rounded-md border border-border bg-card px-3 py-2.5 shadow-lg",
          "ring-2 ring-border/60"
        )}
      >
        <div className="mb-1 flex items-center gap-1.5 text-xs font-medium">
          <ImageIcon className="size-3.5 shrink-0 text-muted-foreground" />
          Image
        </div>
        <div className="mt-1.5 h-14 overflow-hidden rounded-md border">
          <FileServiceImage
            url={payload.url}
            alt=""
            className="h-full w-full object-cover"
            loadingClassName="h-full w-full"
          />
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "w-[min(280px,calc(100vw-2rem))] cursor-grabbing rounded-md border border-border bg-card px-3 py-2.5 shadow-lg",
        "ring-2 ring-border/60"
      )}
    >
      <div className="mb-1 flex items-center gap-1.5 text-xs font-medium">
        <Video className="size-3.5 shrink-0 text-muted-foreground" />
        Video
      </div>
      <div className="mt-1.5 h-14 overflow-hidden rounded-md border bg-black">
        <FileServiceVideo
          url={payload.url}
          className="h-full w-full object-cover"
          muted
        />
      </div>
    </div>
  )
}

type PaletteItem = {
  id: string
  label: string
  icon: typeof AlignLeft
  payload: UploadPaletteDragPayload
  textPreview?: string
  thumb?: ReactNode
}

function DraggableItem({ item }: { item: PaletteItem }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: item.id,
    data: item.payload,
  })

  return (
    <div
      ref={setNodeRef}
      style={{ opacity: isDragging ? 0.45 : 1 }}
      {...listeners}
      {...attributes}
      className={cn(
        "cursor-grab rounded-md border border-border bg-card px-3 py-2.5 transition-opacity duration-150 active:cursor-grabbing",
        "hover:border-border/80 hover:bg-muted/40"
      )}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium">
          <item.icon className="size-3.5 shrink-0 text-muted-foreground" />
          {item.label}
        </div>
      </div>
      {item.textPreview ? (
        <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
          {item.textPreview}
        </p>
      ) : null}
      {item.thumb}
    </div>
  )
}

type UploadContentPaletteProps = {
  resolved: UploadResolvedOutputs
}

export function UploadContentPalette({ resolved }: UploadContentPaletteProps) {
  const items: PaletteItem[] = []

  if (resolved.text?.trim()) {
    items.push({
      id: "palette-text",
      label: "Text",
      icon: AlignLeft,
      payload: { kind: "text", source: "text" },
      textPreview: resolved.text,
    })
  }
  if (resolved.translatedText?.trim()) {
    items.push({
      id: "palette-translation",
      label: "Translation",
      icon: Languages,
      payload: { kind: "text", source: "translatedText" },
      textPreview: resolved.translatedText,
    })
  }
  if (resolved.summary?.trim()) {
    items.push({
      id: "palette-summary",
      label: "Summary",
      icon: List,
      payload: { kind: "text", source: "summary" },
      textPreview: resolved.summary,
    })
  }
  if (resolved.image?.trim()) {
    items.push({
      id: "palette-image",
      label: "Image",
      icon: ImageIcon,
      payload: { kind: "image", url: resolved.image.trim() },
      thumb: (
        <div className="mt-1.5 h-14 overflow-hidden rounded-md border">
          <FileServiceImage
            url={resolved.image}
            alt=""
            className="h-full w-full object-cover"
            loadingClassName="h-full w-full"
          />
        </div>
      ),
    })
  }
  if (resolved.video?.trim()) {
    items.push({
      id: "palette-video",
      label: "Video",
      icon: Video,
      payload: { kind: "video", url: resolved.video.trim() },
      thumb: (
        <div className="mt-1.5 h-14 overflow-hidden rounded-md border bg-black">
          <FileServiceVideo
            url={resolved.video.trim()}
            className="h-full w-full object-cover"
            muted
          />
        </div>
      ),
    })
  }

  if (items.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No generated content to drag yet.
      </p>
    )
  }

  return (
    <div className="flex h-full flex-col gap-2 overflow-x-hidden overflow-y-auto pr-1">
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        Generated contents
      </p>
      {items.map((item) => (
        <DraggableItem key={item.id} item={item} />
      ))}
    </div>
  )
}
