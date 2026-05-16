import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, Lock, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { WorkflowNode, WorkflowNodeType } from "@/shared/types/workflow.type"

const NODE_TYPE_LABELS: Record<WorkflowNodeType, string> = {
  keyword_planner: "Keyword Planner",
  text_generation: "Text Generation",
  image_generation: "Image Generation",
  video_generation: "Video Generation",
  translation: "Translation",
  transcription: "Transcription",
  summarization: "Summarization",
}

function summarizeNodeConfig(node: WorkflowNode): string {
  const c = node.config ?? {}
  switch (node.type) {
    case "translation":
      return `${String(c.sourceLanguage ?? "auto")} → ${String(c.targetLanguage ?? "?")} · ${String(c.formalityLevel ?? "casual")}${c.preserveFormatting === false ? " · reflow OK" : ""}`
    case "transcription":
      return `Language ${String(c.language ?? "auto")} · ${String(c.sourceType ?? "audio")}`
    case "keyword_planner":
      return [
        c.model,
        c.temperature !== undefined && c.temperature !== null
          ? String(c.temperature)
          : "",
        c.maxTokens !== undefined && c.maxTokens !== null
          ? String(c.maxTokens)
          : "",
      ]
        .filter((x) => x !== "")
        .join(" · ") || "Default planner settings"
    case "text_generation":
      return [c.tone, c.textLength, c.outputFormat].filter(Boolean).join(" · ") || "Default text settings"
    case "image_generation":
      return [c.aspectRatio, c.quality, c.style].filter(Boolean).join(" · ") || "Default image settings"
    case "video_generation":
      return [
        c.duration !== undefined && c.duration !== null
          ? `${String(c.duration)}s`
          : "",
        c.aspectRatio,
        c.resolution,
      ]
        .filter(Boolean)
        .join(" · ") || "Default video settings"
    case "summarization":
      return [c.summaryLength, c.outputFormat].filter(Boolean).join(" · ") || "Default summary settings"
    default:
      return ""
  }
}

type WorkflowNodeCardProps = {
  node: WorkflowNode
  onRemove: (nodeId: string) => void
}

export function WorkflowNodeCard({ node, onRemove }: WorkflowNodeCardProps) {
  const nonDeletable =
    node.type === "text_generation" || node.type === "keyword_planner"
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: node.nodeId,
    disabled: node.isLocked && !nonDeletable,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-start gap-3 rounded-xl border border-border bg-background p-4 shadow-sm"
    >
      <div className="mt-1 flex shrink-0 flex-col items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
          {node.order}
        </span>
        {!node.isLocked || nonDeletable ? (
          <button
            type="button"
            className="cursor-grab text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">
            {NODE_TYPE_LABELS[node.type]}
          </span>
          {node.isLocked ? (
            <Lock className="h-3.5 w-3.5 text-muted-foreground" />
          ) : null}
        </div>

        <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
          <p className="text-xs font-semibold text-muted-foreground">Node settings</p>
          <p className="mt-1 text-foreground">{summarizeNodeConfig(node)}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            What to post about is set when you run the workflow, not here.
          </p>
        </div>
      </div>

      {!nonDeletable ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="mt-1 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={() => onRemove(node.nodeId)}
        >
          <X className="h-4 w-4" />
        </Button>
      ) : null}
    </div>
  )
}
