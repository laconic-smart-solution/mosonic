import { useLayoutEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

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
  /** Seeded when the dialog opens (e.g. navigation state). */
  initialPrompt: string
  /** Persist draft when the dialog closes so the parent stays in sync without re-rendering per keystroke. */
  onPromptChange: (value: string) => void
  promptAreaKey: number
  onExtract: (text: string, attachments: Attachment[]) => void | Promise<void>
}

export function CreateRuleDialog({
  open,
  onOpenChange,
  initialPrompt,
  onPromptChange,
  promptAreaKey,
  onExtract,
}: CreateRuleDialogProps) {
  const { t } = useTranslation("rules")
  const [draft, setDraft] = useState("")
  const draftRef = useRef("")
  draftRef.current = draft

  useLayoutEffect(() => {
    if (open) setDraft(initialPrompt)
  }, [open, initialPrompt])

  function handleOpenChange(next: boolean) {
    if (!next) onPromptChange(draftRef.current)
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("createDialog.title")}</DialogTitle>
          <DialogDescription>
            {t("createDialog.description")}
          </DialogDescription>
        </DialogHeader>
        <PromptArea
          key={promptAreaKey}
          value={draft}
          onChange={setDraft}
          placeholder={t("createDialog.placeholder")}
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
