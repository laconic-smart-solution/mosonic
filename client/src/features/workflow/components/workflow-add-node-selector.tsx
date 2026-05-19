import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal"
import { backendTypeToCanvas } from "@/features/workflow/data/workflow-model"
import { getWorkflowNodeUsageSummary } from "@/features/workflow/data/workflow-node-guide"
import type { WorkflowNodeType } from "@/shared/types/workflow.type"

const ADDABLE_NODE_TYPES: { type: WorkflowNodeType; label: string }[] = [
  { type: "image_generation", label: "Image Generation" },
  { type: "video_generation", label: "Video Generation" },
  { type: "translation", label: "Translation" },
  { type: "transcription", label: "Transcription" },
  { type: "summarization", label: "Summarization" },
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
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent className="max-w-sm sm:max-w-sm">
        <ModalHeader>
          <ModalTitle>Add Node</ModalTitle>
        </ModalHeader>

        <div className="space-y-2">
          {ADDABLE_NODE_TYPES.map(({ type, label }) => {
            const canvasType = backendTypeToCanvas(type)
            const description =
              getWorkflowNodeUsageSummary(canvasType) ?? "Add this step to your workflow"
            return (
              <button
                key={type}
                type="button"
                onClick={() => handleSelect(type)}
                className="w-full rounded-lg border border-border bg-background p-3 text-left transition hover:border-primary/40 hover:bg-muted/30"
              >
                <p className="text-sm font-medium text-foreground">{label}</p>
                <p className="text-xs text-muted-foreground">{description}</p>
              </button>
            )
          })}
        </div>
      </ModalContent>
    </Modal>
  )
}
