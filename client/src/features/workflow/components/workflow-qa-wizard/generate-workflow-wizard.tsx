import { useLayoutEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { ListChecks, Sparkles } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import {
  createPresetDefaultWorkflowQAAnswers,
  type WorkflowQAAnswers,
} from "@/features/workflow/types/workflow-qa.type"
import { WorkflowQaWizard } from "./workflow-qa-wizard"

type GeneratePath = "default" | "qa" | null

type GenerateWorkflowWizardProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  ruleChannelIds: string[]
  initialMessage?: string
  isSubmitting?: boolean
  onSubmit: (answers: WorkflowQAAnswers) => void
}

export function GenerateWorkflowWizard({
  open,
  onOpenChange,
  ruleChannelIds,
  initialMessage = "",
  isSubmitting = false,
  onSubmit,
}: GenerateWorkflowWizardProps) {
  const { t } = useTranslation("workflow")
  const [path, setPath] = useState<GeneratePath>(null)

  useLayoutEffect(() => {
    if (open) {
      setPath(null)
    }
  }, [open])

  function handleShellOpenChange(next: boolean) {
    if (isSubmitting) return
    onOpenChange(next)
    if (!next) setPath(null)
  }

  function startDefault() {
    setPath("default")
    onSubmit(createPresetDefaultWorkflowQAAnswers(initialMessage))
  }

  function startQa() {
    setPath("qa")
  }

  return (
    <>
      <Dialog
        open={open && path !== "qa"}
        onOpenChange={handleShellOpenChange}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("qaWizard.title")}</DialogTitle>
            <DialogDescription>
              {t("qaWizard.path.chooserDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={startDefault}
              disabled={isSubmitting}
              className={cn(
                "flex flex-col items-start gap-2 rounded-xl border border-primary/40 bg-primary/5 p-4 text-left transition-colors hover:bg-primary/10",
                "disabled:pointer-events-none disabled:opacity-50",
              )}
            >
              <Sparkles className="size-5 text-primary" />
              <span className="font-medium">{t("qaWizard.path.defaultTitle")}</span>
              <span className="text-xs text-muted-foreground">
                {t("qaWizard.path.defaultDescription")}
              </span>
            </button>
            <button
              type="button"
              onClick={startQa}
              disabled={isSubmitting}
              className={cn(
                "flex flex-col items-start gap-2 rounded-xl border border-border p-4 text-left transition-colors hover:border-primary/30 hover:bg-muted/40",
                "disabled:pointer-events-none disabled:opacity-50",
              )}
            >
              <ListChecks className="size-5 text-muted-foreground" />
              <span className="font-medium">
                {t("qaWizard.path.takeQuestionTitle")}
              </span>
              <span className="text-xs text-muted-foreground">
                {t("qaWizard.path.takeQuestionDescription")}
              </span>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <WorkflowQaWizard
        open={open && path === "qa"}
        onOpenChange={(next) => {
          if (isSubmitting) return
          if (!next) {
            setPath(null)
            onOpenChange(false)
          }
        }}
        ruleChannelIds={ruleChannelIds}
        initialMessage={initialMessage}
        isSubmitting={isSubmitting}
        onSubmit={onSubmit}
      />
    </>
  )
}
