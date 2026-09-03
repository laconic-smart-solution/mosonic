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
import {
  createDefaultRuleIntakeAnswers,
  type RuleIntakeAnswers,
} from "@/features/rules/types/rule-intake.type"

type PendingExtract = {
  text: string
  attachments: Attachment[]
  intake: RuleIntakeAnswers
}

type CreateRuleWizardProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialPrompt: string
  onPromptChange: (value: string) => void
  promptAreaKey: number
  onExtract: (
    text: string,
    attachments: Attachment[],
    intake?: RuleIntakeAnswers,
  ) => void | Promise<void>
  isExtracting?: boolean
}

export function CreateRuleWizard({
  open,
  onOpenChange,
  initialPrompt,
  onPromptChange,
  promptAreaKey,
  onExtract,
  isExtracting = false,
}: CreateRuleWizardProps) {
  const { t } = useTranslation("rules")
  const generationCostsQuery = useGenerationCreditCostsQuery(open)
  const [draft, setDraft] = useState("")
  const [confirmOpen, setConfirmOpen] = useState(false)
  const pendingExtractRef = useRef<PendingExtract | null>(null)
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
            <DialogDescription>{t("createDialog.description")}</DialogDescription>
          </DialogHeader>

          <PromptArea
            key={promptAreaKey}
            value={draft}
            onChange={setDraft}
            placeholder={t("createDialog.placeholder")}
            acceptFileTypes=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.gif,.webp"
            onSubmit={(text, attachments) => {
              pendingExtractRef.current = {
                text,
                attachments,
                intake: createDefaultRuleIntakeAnswers("express"),
              }
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
          void onExtract(pending.text, pending.attachments, pending.intake)
          setConfirmOpen(false)
          pendingExtractRef.current = null
          onOpenChange(false)
        }}
      />
    </>
  )
}
