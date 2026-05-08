import { PromptArea, type Attachment } from "@/components/core/prompt-area"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type CreateRuleDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  prompt: string
  onPromptChange: (value: string) => void
  promptAreaKey: number
  onExtract: (text: string, attachments: Attachment[]) => void | Promise<void>
}

export function CreateRuleDialog({
  open,
  onOpenChange,
  prompt,
  onPromptChange,
  promptAreaKey,
  onExtract,
}: CreateRuleDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create rule by prompt</DialogTitle>
          <DialogDescription>
            Enter campaign context and we will create a dummy rule from it.
          </DialogDescription>
        </DialogHeader>
        <PromptArea
          key={promptAreaKey}
          value={prompt}
          onChange={onPromptChange}
          placeholder="Describe your brand, audience, channels, and campaign goals..."
          acceptFileTypes=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.gif,.webp"
          onSubmit={(text, atts) => {
            void onExtract(text, atts)
          }}
          className="border-border"
        />
      </DialogContent>
    </Dialog>
  )
}
