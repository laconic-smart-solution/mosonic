import { PromptArea, type Attachment } from "@/components/core/prompt-area"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type CreateWorkflowDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  prompt: string
  onPromptChange: (value: string) => void
  promptAreaKey: number
  onGenerate: (text: string, attachments: Attachment[]) => void | Promise<void>
}

export function CreateWorkflowDialog({
  open,
  onOpenChange,
  prompt,
  onPromptChange,
  promptAreaKey,
  onGenerate,
}: CreateWorkflowDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Generate workflow by prompt</DialogTitle>
          <DialogDescription>
            Describe the target content and we will generate or regenerate the
            workflow for this rule.
          </DialogDescription>
        </DialogHeader>
        <PromptArea
          key={promptAreaKey}
          value={prompt}
          onChange={onPromptChange}
          placeholder="Describe what workflow should be generated..."
          onSubmit={(text, atts) => {
            void onGenerate(text, atts)
          }}
          className="border-border"
        />
      </DialogContent>
    </Dialog>
  )
}
