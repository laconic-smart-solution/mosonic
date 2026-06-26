import { useCallback, useMemo, useState } from "react"
import {
  channelIdsToIntakeChannels,
  createDefaultRuleIntakeAnswers,
  intakeChannelsToIds,
  type RuleIntakeAnswers,
} from "@/features/rules/types/rule-intake.type"

export type RuleQaStepId =
  | "purpose"
  | "sources"
  | "brand"
  | "audience"
  | "channels"
  | "campaign"
  | "guidelines"
  | "review"

function buildStepOrder(): RuleQaStepId[] {
  return ["purpose", "sources", "brand", "audience", "channels", "campaign", "guidelines", "review"]
}

export function validateRuleQaStep(
  step: RuleQaStepId,
  answers: RuleIntakeAnswers,
): string | null {
  if (step === "purpose" && !answers.contentPurpose) {
    return "selectPurpose"
  }
  if (step === "channels" && intakeChannelsToIds(answers.channels).length === 0) {
    return "selectAtLeastOneChannel"
  }
  if (step === "audience" && !answers.primaryLanguage?.trim()) {
    return "selectPrimaryLanguage"
  }
  return null
}

export function useRuleQaSteps() {
  const [answers, setAnswers] = useState<RuleIntakeAnswers>(() =>
    createDefaultRuleIntakeAnswers("guided"),
  )
  const [stepIndex, setStepIndex] = useState(0)

  const steps = useMemo(() => buildStepOrder(), [])
  const currentStep = steps[stepIndex] ?? steps[0]
  const isFirst = stepIndex === 0
  const isLast = stepIndex >= steps.length - 1

  const reset = useCallback(() => {
    setAnswers(createDefaultRuleIntakeAnswers("guided"))
    setStepIndex(0)
  }, [])

  const patchAnswers = useCallback((patch: Partial<RuleIntakeAnswers>) => {
    setAnswers((prev) => ({ ...prev, ...patch }))
  }, [])

  const setChannelIds = useCallback((ids: string[]) => {
    setAnswers((prev) => ({
      ...prev,
      channels: channelIdsToIntakeChannels(ids, prev.channels),
    }))
  }, [])

  const goNext = useCallback(() => {
    const step = steps[stepIndex] ?? steps[0]
    const err = validateRuleQaStep(step, answers)
    if (err) return err
    setStepIndex((i) => Math.min(i + 1, steps.length - 1))
    return null
  }, [answers, stepIndex, steps])

  const goBack = useCallback(() => {
    setStepIndex((i) => Math.max(i - 1, 0))
  }, [])

  return {
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
  }
}
