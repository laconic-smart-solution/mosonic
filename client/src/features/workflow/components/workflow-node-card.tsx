import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, Lock, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import type { WorkflowNode, WorkflowNodeType } from "@/shared/types/workflow.type"

const NODE_TYPE_LABELS: Record<WorkflowNodeType, string> = {
  text_generation: "Text Generation",
  image_generation: "Image Generation",
  video_generation: "Video Generation",
  translation: "Translation",
  transcription: "Transcription",
  summarization: "Summarization",
}

type WorkflowNodeCardProps = {
  node: WorkflowNode
  onRemove: (nodeId: string) => void
  onPromptChange: (nodeId: string, value: string) => void
}

export function WorkflowNodeCard({ node, onRemove, onPromptChange }: WorkflowNodeCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: node.nodeId,
    disabled: node.isLocked,
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
          <span className="text-sm font-medium text-foreground">
            {NODE_TYPE_LABELS[node.type]}
          </span>
          {node.isLocked ? (
            <Lock className="h-3.5 w-3.5 text-muted-foreground" />
          ) : null}
        </div>

        <Textarea
          value={node.userPrompt ?? ""}
          onChange={(e) => onPromptChange(node.nodeId, e.target.value)}
          placeholder="Enter prompt for this node…"
          rows={3}
          className="resize-none text-sm"
        />
      </div>

      {!node.isLocked ? (
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
