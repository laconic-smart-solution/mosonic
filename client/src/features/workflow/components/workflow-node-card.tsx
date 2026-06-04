import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, Lock, X } from "lucide-react"
import { useTranslation } from "react-i18next"
import type { TFunction } from "i18next"
import { Button } from "@/components/ui/button"
import {
  backendTypeToCanvas,
  getWfNodeTypeLabel,
} from "@/features/workflow/data/workflow-model"
import type { WorkflowNode, WorkflowNodeType } from "@/shared/types/workflow.type"

function summarizeNodeConfig(
  node: WorkflowNode,
  t: TFunction<"workflow">,
): string {
  const c = node.config ?? {}
  switch (node.type) {
    case "translation":
      return `${String(c.sourceLanguage ?? "auto")} → ${String(c.targetLanguage ?? "?")} · ${String(c.formalityLevel ?? "casual")}${c.preserveFormatting === false ? ` · ${t("nodeCard.reflowOk")}` : ""}`
    case "transcription":
      return `Language ${String(c.language ?? "auto")} · ${String(c.sourceType ?? "audio")}`
    case "keyword_planner":
      return (
        [
          c.model,
          c.temperature !== undefined && c.temperature !== null
            ? String(c.temperature)
            : "",
          c.maxTokens !== undefined && c.maxTokens !== null
            ? String(c.maxTokens)
            : "",
        ]
          .filter((x) => x !== "")
          .join(" · ") || t("nodeCard.defaultPlannerSettings")
      )
    case "text_generation":
      return (
        [c.tone, c.textLength, c.outputFormat].filter(Boolean).join(" · ") ||
        t("nodeCard.defaultTextSettings")
      )
    case "image_generation":
      return (
        [c.aspectRatio, c.quality, c.style].filter(Boolean).join(" · ") ||
        t("nodeCard.defaultImageSettings")
      )
    case "video_generation":
      if (c.mode === "presenter") {
        return [
          t("nodeCard.presenter"),
          c.duration !== undefined && c.duration !== null
            ? `${String(c.duration)}s`
            : "",
          c.heygenOrientation === "portrait" ? "9:16" : "16:9",
          c.heygenExpressiveness,
        ]
          .filter(Boolean)
          .join(" · ")
      }
      return (
        [
          t("nodeCard.cinematic"),
          c.duration !== undefined && c.duration !== null
            ? `${String(c.duration)}s`
            : "",
          c.aspectRatio,
          c.resolution,
        ]
          .filter(Boolean)
          .join(" · ") || t("nodeCard.defaultVideoSettings")
      )
    case "summarization":
      return (
        [c.summaryLength, c.outputFormat].filter(Boolean).join(" · ") ||
        t("nodeCard.defaultSummarySettings")
      )
    default:
      return ""
  }
}

type WorkflowNodeCardProps = {
  node: WorkflowNode
  onRemove: (nodeId: string) => void
}

export function WorkflowNodeCard({ node, onRemove }: WorkflowNodeCardProps) {
  const { t } = useTranslation("workflow")
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: node.nodeId,
      disabled: node.isLocked,
    })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const typeLabel = getWfNodeTypeLabel(backendTypeToCanvas(node.type as WorkflowNodeType))

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
        {!node.isLocked ? (
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
          <span className="text-sm font-medium text-foreground">{typeLabel}</span>
          {node.isLocked ? (
            <Lock className="h-3.5 w-3.5 text-muted-foreground" />
          ) : null}
        </div>

        <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
          <p className="text-xs font-semibold text-muted-foreground">
            {t("nodeCard.nodeSettings")}
          </p>
          <p className="mt-1 text-foreground">{summarizeNodeConfig(node, t)}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("nodeCard.runTopicHint")}
          </p>
        </div>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="mt-1 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={() => onRemove(node.nodeId)}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  )
}
