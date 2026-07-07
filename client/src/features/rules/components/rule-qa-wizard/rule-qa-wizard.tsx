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
import type { Attachment } from "@/components/core/prompt-area"
import { DISTRIBUTION_CHANNELS } from "@/shared/constants/distribution-channels"
import {
  intakeChannelsToIds,
  toRuleIntakePayload,
  type RuleIntakeAnswers,
} from "@/features/rules/types/rule-intake.type"
import { useRuleQaSteps, validateRuleQaStep } from "./use-rule-qa-steps"
import { RuleQaChannelPicker } from "./rule-qa-channel-picker"
import { RuleQaLanguagePicker } from "./rule-qa-language-picker"
import { RuleQaPurposePicker } from "./rule-qa-purpose-picker"
import { RuleQaSourcesStep } from "./rule-qa-sources-step"
import { RuleQaReviewStep } from "./rule-qa-review-step"
import {
  RuleQaAudienceStep,
  RuleQaBrandStep,
  RuleQaCampaignStep,
  RuleQaGuidelinesStep,
} from "./rule-qa-section-steps"

const CHANNEL_OPTIONS = DISTRIBUTION_CHANNELS.map((c) => c.id)

export type RuleQaSubmitPayload = {
  text: string
  attachments: Attachment[]
  intake: RuleIntakeAnswers
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  isSubmitting?: boolean
  onSubmit: (payload: RuleQaSubmitPayload) => void
}

export function RuleQaWizard({
  open,
  onOpenChange,
  isSubmitting = false,
  onSubmit,
}: Props) {
  const { t } = useTranslation("rules")
  const {
    answers,
    patchAnswers,
    setChannelIds,
    steps,
    currentStep,
    stepIndex,
    isFirst,
    isLast,
    goNext,
    goBack,
    reset,
  } = useRuleQaSteps()
  const [validationKey, setValidationKey] = useState<string | null>(null)
  const [sourcesText, setSourcesText] = useState("")
  const [sourcesAttachments, setSourcesAttachments] = useState<Attachment[]>([])
  const [sourcesKey, setSourcesKey] = useState(0)

  const progressPercent = Math.round(((stepIndex + 1) / steps.length) * 100)

  useEffect(() => {
    if (open) {
      reset()
      setValidationKey(null)
      setSourcesText("")
      setSourcesAttachments([])
      setSourcesKey((k) => k + 1)
    }
  }, [open, reset])

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
    const err = validateRuleQaStep(currentStep, answers)
    if (err) {
      setValidationKey(err)
      toast.error(t(`qaWizard.validation.${err}`))
      return
    }
    const intake = toRuleIntakePayload({ ...answers, mode: "guided" })
    onOpenChange(false)
    onSubmit({
      text: sourcesText,
      attachments: sourcesAttachments,
      intake,
    })
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

        <div className="max-h-[min(52vh,420px)] min-h-[148px] overflow-y-auto px-6 py-5">
          {currentStep === "purpose" ? (
            <div className="space-y-4">
              <RuleQaPurposePicker
                value={answers.contentPurpose}
                onChange={(contentPurpose) => patchAnswers({ contentPurpose })}
              />
              <Textarea
                value={answers.contentPurposeNotes ?? ""}
                onChange={(e) =>
                  patchAnswers({ contentPurposeNotes: e.target.value })
                }
                placeholder={t("qaWizard.steps.purpose.notesPlaceholder")}
                rows={2}
                className="resize-none rounded-xl"
              />
            </div>
          ) : null}

          {currentStep === "sources" ? (
            <RuleQaSourcesStep
              promptKey={sourcesKey}
              value={sourcesText}
              onChange={setSourcesText}
              onAttachmentsChange={setSourcesAttachments}
              placeholder={t("qaWizard.steps.sources.placeholder")}
            />
          ) : null}

          {currentStep === "brand" ? (
            <RuleQaBrandStep answers={answers} patchAnswers={patchAnswers} />
          ) : null}

          {currentStep === "audience" ? (
            <div className="space-y-4">
              <RuleQaAudienceStep answers={answers} patchAnswers={patchAnswers} />
              <RuleQaLanguagePicker
                primaryLanguage={answers.primaryLanguage ?? ""}
                targetLanguages={answers.targetLanguages ?? []}
                onPrimaryChange={(primaryLanguage) =>
                  patchAnswers({ primaryLanguage })
                }
                onTargetChange={(targetLanguages) =>
                  patchAnswers({ targetLanguages })
                }
              />
            </div>
          ) : null}

          {currentStep === "channels" ? (
            <RuleQaChannelPicker
              options={CHANNEL_OPTIONS}
              value={intakeChannelsToIds(answers.channels)}
              onChange={setChannelIds}
            />
          ) : null}

          {currentStep === "campaign" ? (
            <RuleQaCampaignStep answers={answers} patchAnswers={patchAnswers} />
          ) : null}

          {currentStep === "guidelines" ? (
            <RuleQaGuidelinesStep answers={answers} patchAnswers={patchAnswers} />
          ) : null}

          {currentStep === "review" ? (
            <RuleQaReviewStep
              answers={answers}
              attachmentCount={sourcesAttachments.length}
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
