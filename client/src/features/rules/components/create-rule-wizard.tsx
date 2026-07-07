import { useLayoutEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Sparkles, Zap } from "lucide-react"

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
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useGenerationCreditCostsQuery } from "@/shared/queries/credit.query"
import {
  createDefaultRuleIntakeAnswers,
  type RuleIntakeAnswers,
} from "@/features/rules/types/rule-intake.type"
import { RuleQaWizard, type RuleQaSubmitPayload } from "./rule-qa-wizard/rule-qa-wizard"
import { RuleQaPurposePicker } from "./rule-qa-wizard/rule-qa-purpose-picker"

type CreatePath = "guided" | "express" | null

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
  const [path, setPath] = useState<CreatePath>(null)
  const [guidedOpen, setGuidedOpen] = useState(false)
  const [expressDraft, setExpressDraft] = useState("")
  const [expressPurpose, setExpressPurpose] = useState<
    RuleIntakeAnswers["contentPurpose"] | undefined
  >()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const pendingExtractRef = useRef<PendingExtract | null>(null)
  const expressDraftRef = useRef("")
  expressDraftRef.current = expressDraft

  useLayoutEffect(() => {
    if (open) {
      setPath(null)
      setGuidedOpen(false)
      setExpressDraft(initialPrompt)
      setExpressPurpose(undefined)
    }
  }, [open, initialPrompt])

  function handleShellOpenChange(next: boolean) {
    if (!next) onPromptChange(expressDraftRef.current)
    onOpenChange(next)
    if (!next) {
      setPath(null)
      setGuidedOpen(false)
    }
  }

  function startGuided() {
    setPath("guided")
    setGuidedOpen(true)
  }

  function startExpress() {
    setPath("express")
  }

  function queueExtract(pending: PendingExtract) {
    pendingExtractRef.current = pending
    setConfirmOpen(true)
  }

  function handleGuidedSubmit(payload: RuleQaSubmitPayload) {
    setGuidedOpen(false)
    queueExtract(payload)
  }

  return (
    <>
      <Dialog open={open && path !== "guided"} onOpenChange={handleShellOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("createDialog.title")}</DialogTitle>
            <DialogDescription>
              {path === "express"
                ? t("qaWizard.path.expressDescription")
                : t("createDialog.description")}
            </DialogDescription>
          </DialogHeader>

          {path === null ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={startGuided}
                className={cn(
                  "flex flex-col items-start gap-2 rounded-xl border border-primary/40 bg-primary/5 p-4 text-left transition-colors hover:bg-primary/10",
                )}
              >
                <Sparkles className="size-5 text-primary" />
                <span className="font-medium">{t("qaWizard.path.guidedTitle")}</span>
                <span className="text-xs text-muted-foreground">
                  {t("qaWizard.path.guidedDescription")}
                </span>
              </button>
              <button
                type="button"
                onClick={startExpress}
                className="flex flex-col items-start gap-2 rounded-xl border border-border p-4 text-left transition-colors hover:border-primary/30 hover:bg-muted/40"
              >
                <Zap className="size-5 text-muted-foreground" />
                <span className="font-medium">{t("qaWizard.path.expressTitle")}</span>
                <span className="text-xs text-muted-foreground">
                  {t("qaWizard.path.expressShort")}
                </span>
              </button>
            </div>
          ) : null}

          {path === "express" ? (
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  {t("qaWizard.steps.purpose.title")}
                </p>
                <RuleQaPurposePicker
                  value={expressPurpose}
                  onChange={setExpressPurpose}
                />
              </div>
              <PromptArea
                key={promptAreaKey}
                value={expressDraft}
                onChange={setExpressDraft}
                placeholder={t("createDialog.placeholder")}
                acceptFileTypes=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.gif,.webp"
                onSubmit={(text, attachments) => {
                  const intake: RuleIntakeAnswers = {
                    ...createDefaultRuleIntakeAnswers("express"),
                    mode: "express",
                    contentPurpose: expressPurpose,
                  }
                  queueExtract({ text, attachments, intake })
                }}
                className="border-border"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="px-0 text-muted-foreground"
                onClick={() => setPath(null)}
              >
                {t("qaWizard.back")}
              </Button>
            </div>
          ) : null}

          {path === null ? null : (
            <GenerationCreditHint
              credits={generationCostsQuery.data?.ruleGeneration}
              className="justify-start px-1"
            />
          )}
        </DialogContent>
      </Dialog>

      <RuleQaWizard
        open={guidedOpen}
        onOpenChange={setGuidedOpen}
        isSubmitting={isExtracting}
        onSubmit={handleGuidedSubmit}
      />

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
