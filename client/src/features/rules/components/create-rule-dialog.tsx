import { useLayoutEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { PromptArea, type Attachment } from "@/components/core/prompt-area"
import { GenerationCreditConfirmDialog } from "@/features/credit/components/generation-credit-confirm-dialog"
import { GenerationCreditHint } from "@/features/credit/components/generation-credit-hint"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useGenerationCreditCostsQuery } from "@/shared/queries/credit.query"

type CreateRuleDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Seeded when the dialog opens (e.g. navigation state). */
  initialPrompt: string
  /** Persist draft when the dialog closes so the parent stays in sync without re-rendering per keystroke. */
  onPromptChange: (value: string) => void
  promptAreaKey: number
  onExtract: (text: string, attachments: Attachment[]) => void | Promise<void>
  isExtracting?: boolean
}

export function CreateRuleDialog({
  open,
  onOpenChange,
  initialPrompt,
  onPromptChange,
  promptAreaKey,
  onExtract,
  isExtracting = false,
}: CreateRuleDialogProps) {
  const { t } = useTranslation("rules")
  const generationCostsQuery = useGenerationCreditCostsQuery(open)
  const [draft, setDraft] = useState("")
  const [confirmOpen, setConfirmOpen] = useState(false)
  const pendingExtractRef = useRef<{ text: string; attachments: Attachment[] } | null>(
    null,
  )
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
    <>
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
            pendingExtractRef.current = { text, attachments: atts }
            setConfirmOpen(true)
          }}
          className="border-border"
        />
        <GenerationCreditHint
          credits={generationCostsQuery.data?.ruleGeneration}
          className="justify-start px-1"
        />
      </DialogContent>
      </Dialog>

      <GenerationCreditConfirmDialog
        open={confirmOpen}
        onOpenChange={(next) => {
          setConfirmOpen(next)
          if (!next) pendingExtractRef.current = null
        }}
        kind="rule"
        isSubmitting={isExtracting}
        onConfirm={() => {
          const pending = pendingExtractRef.current
          if (!pending) return
          void onExtract(pending.text, pending.attachments)
          setConfirmOpen(false)
          pendingExtractRef.current = null
          onOpenChange(false)
        }}
      />
    </>
  )
}
