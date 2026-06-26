import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Loader2, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type { WorkflowQAAnswers } from "@/features/workflow/types/workflow-qa.type"
import { useWorkflowQaSteps, validateWorkflowQaStep } from "./use-workflow-qa-steps"
import { WorkflowQaChannelPicker } from "./workflow-qa-channel-picker"
import { WorkflowQaLanguagePicker } from "./workflow-qa-language-picker"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  ruleChannelIds: string[]
  initialMessage?: string
  isSubmitting?: boolean
  onSubmit: (answers: WorkflowQAAnswers) => void
}

function YesNoButtons({
  value,
  onChange,
}: {
  value: boolean
  onChange: (v: boolean) => void
}) {
  const { t } = useTranslation("workflow")
  const options = [
    { choice: true, label: t("qaWizard.yes") },
    { choice: false, label: t("qaWizard.no") },
  ] as const

  return (
    <div className="grid grid-cols-2 gap-3">
      {options.map(({ choice, label }) => {
        const selected = value === choice
        return (
          <button
            key={label}
            type="button"
            onClick={() => onChange(choice)}
            className={cn(
              "rounded-xl border px-4 py-5 text-center text-base font-medium transition-colors",
              selected
                ? "border-primary bg-primary/10 text-primary shadow-sm ring-2 ring-primary/30"
                : "border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted/40",
            )}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

export function WorkflowQaWizard({
  open,
  onOpenChange,
  ruleChannelIds,
  initialMessage = "",
  isSubmitting = false,
  onSubmit,
}: Props) {
  const { t } = useTranslation("workflow")
  const {
    answers,
    patchAnswers,
    steps,
    currentStep,
    stepIndex,
    isFirst,
    isLast,
    goNext,
    goBack,
    reset,
    setGenerateSummary,
    setGenerateImage,
    setGenerateVideo,
    setTranslate,
  } = useWorkflowQaSteps(initialMessage, ruleChannelIds)
  const [validationKey, setValidationKey] = useState<string | null>(null)

  const progressPercent = Math.round(((stepIndex + 1) / steps.length) * 100)

  useEffect(() => {
    if (open) {
      reset(initialMessage, ruleChannelIds)
      setValidationKey(null)
    }
  }, [open, initialMessage, reset, ruleChannelIds])

  function handleOpenChange(next: boolean) {
    if (isSubmitting) return
    onOpenChange(next)
  }

  function handleNext() {
    const err = goNext()
    if (err) {
      setValidationKey(err)
      toast.error(t(`qaWizard.validation.${err}`))
      return
    }
    setValidationKey(null)
  }

  function handleSubmit() {
    const err = validateWorkflowQaStep(currentStep, answers, ruleChannelIds)
    if (err) {
      setValidationKey(err)
      toast.error(t(`qaWizard.validation.${err}`))
      return
    }
    onOpenChange(false)
    onSubmit(answers)
  }

  const stepTitle = t(`qaWizard.steps.${currentStep}.title`)
  const stepDescription = t(`qaWizard.steps.${currentStep}.description`, {
    defaultValue: "",
  })

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="gap-0 overflow-hidden p-0 sm:max-w-xl"
        showCloseButton={!isSubmitting}
      >
        <div className="border-b border-border/60 bg-muted/20 px-6 pb-5 pt-6">
          <div className="flex items-center gap-2 pr-8">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("qaWizard.title")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("qaWizard.progress", {
                  current: stepIndex + 1,
                  total: steps.length,
                })}
              </p>
            </div>
          </div>

          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <DialogTitle className="mt-5 text-left text-xl font-semibold leading-snug">
            {stepTitle}
          </DialogTitle>
          {stepDescription ? (
            <DialogDescription className="mt-2 text-left text-sm leading-relaxed">
              {stepDescription}
            </DialogDescription>
          ) : null}
        </div>

        <div className="min-h-[148px] px-6 py-5">
          {currentStep === "webSearch" ? (
            <div className="flex flex-col gap-3">
              <YesNoButtons
                value={answers.useWebSearch}
                onChange={(useWebSearch) => patchAnswers({ useWebSearch })}
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t("qaWizard.webSearchHint")}
              </p>
            </div>
          ) : null}

          {currentStep === "keywordPlanner" ? (
            <YesNoButtons
              value={answers.useKeywordPlanner}
              onChange={(useKeywordPlanner) =>
                patchAnswers({ useKeywordPlanner })
              }
            />
          ) : null}

          {currentStep === "summary" ? (
            <YesNoButtons
              value={answers.generateSummary}
              onChange={setGenerateSummary}
            />
          ) : null}

          {currentStep === "summaryChannels" ? (
            <WorkflowQaChannelPicker
              options={ruleChannelIds}
              value={answers.summaryChannels}
              onChange={(summaryChannels) => patchAnswers({ summaryChannels })}
            />
          ) : null}

          {currentStep === "translate" ? (
            <YesNoButtons
              value={answers.translate}
              onChange={setTranslate}
            />
          ) : null}

          {currentStep === "translationChannels" ? (
            <WorkflowQaChannelPicker
              options={ruleChannelIds}
              value={answers.translationChannels}
              onChange={(translationChannels) =>
                patchAnswers({ translationChannels })
              }
            />
          ) : null}

          {currentStep === "targetLanguages" ? (
            <WorkflowQaLanguagePicker
              value={answers.targetLanguages}
              onChange={(targetLanguages) => patchAnswers({ targetLanguages })}
            />
          ) : null}

          {currentStep === "image" ? (
            <YesNoButtons
              value={answers.generateImage}
              onChange={setGenerateImage}
            />
          ) : null}

          {currentStep === "imageChannels" ? (
            <WorkflowQaChannelPicker
              options={ruleChannelIds}
              value={answers.imageChannels}
              onChange={(imageChannels) => patchAnswers({ imageChannels })}
            />
          ) : null}

          {currentStep === "video" ? (
            <YesNoButtons
              value={answers.generateVideo}
              onChange={setGenerateVideo}
            />
          ) : null}

          {currentStep === "videoChannels" ? (
            <WorkflowQaChannelPicker
              options={ruleChannelIds}
              value={answers.videoChannels}
              onChange={(videoChannels) => patchAnswers({ videoChannels })}
            />
          ) : null}

          {currentStep === "additionalMessage" ? (
            <Textarea
              value={answers.additionalMessage}
              onChange={(e) =>
                patchAnswers({ additionalMessage: e.target.value })
              }
              placeholder={t("qaWizard.steps.additionalMessage.placeholder")}
              rows={4}
              className="resize-none rounded-xl border-border/80 bg-background"
            />
          ) : null}

          {validationKey ? (
            <p className="mt-3 text-sm text-destructive">
              {t(`qaWizard.validation.${validationKey}`)}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border/60 bg-muted/20 px-6 py-4">
          <Button
            type="button"
            variant="ghost"
            disabled={isFirst || isSubmitting}
            onClick={goBack}
            className="text-muted-foreground"
          >
            {t("qaWizard.back")}
          </Button>
          {isLast ? (
            <Button
              type="button"
              disabled={isSubmitting}
              onClick={handleSubmit}
              className="min-w-[148px] gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t("qaWizard.generating")}
                </>
              ) : (
                t("qaWizard.generate")
              )}
            </Button>
          ) : (
            <Button type="button" onClick={handleNext} className="min-w-[108px]">
              {t("qaWizard.next")}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
