import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { WorkflowNodeType } from "@/shared/types/workflow.type"

const ADDABLE_NODE_TYPES: { type: WorkflowNodeType; label: string; description: string }[] = [
  { type: "image_generation", label: "Image Generation", description: "Generate images from text prompts" },
  { type: "video_generation", label: "Video Generation", description: "Generate video from prompts or images" },
  { type: "translation", label: "Translation", description: "Translate content to another language" },
  { type: "transcription", label: "Transcription", description: "Convert audio or video to text" },
  { type: "summarization", label: "Summarization", description: "Summarize content from an upstream node" },
]

type WorkflowAddNodeSelectorProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (type: WorkflowNodeType) => void
}

export function WorkflowAddNodeSelector({
  open,
  onOpenChange,
  onSelect,
}: WorkflowAddNodeSelectorProps) {
  function handleSelect(type: WorkflowNodeType) {
    onSelect(type)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Node</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          {ADDABLE_NODE_TYPES.map(({ type, label, description }) => (
            <button
              key={type}
              type="button"
              onClick={() => handleSelect(type)}
              className="w-full rounded-lg border border-border bg-background p-3 text-left transition hover:border-primary/40 hover:bg-muted/30"
            >
              <p className="text-sm font-medium text-foreground">{label}</p>
              <p className="text-xs text-muted-foreground">{description}</p>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
