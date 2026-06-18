import { useCallback, useMemo, useState } from "react"
import {
  createDefaultWorkflowQAAnswers,
  type WorkflowQAAnswers,
} from "@/features/workflow/types/workflow-qa.type"

export type WorkflowQaStepId =
  | "webSearch"
  | "keywordPlanner"
  | "summary"
  | "summaryChannels"
  | "translate"
  | "translationChannels"
  | "targetLanguages"
  | "image"
  | "imageChannels"
  | "video"
  | "videoChannels"
  | "additionalMessage"

function isMultiChannel(ruleChannelIds: string[]): boolean {
  return ruleChannelIds.length > 1
}

function buildStepOrder(
  answers: WorkflowQAAnswers,
  ruleChannelIds: string[],
): WorkflowQaStepId[] {
  const multi = isMultiChannel(ruleChannelIds)
  const steps: WorkflowQaStepId[] = ["webSearch", "keywordPlanner", "summary"]
  if (answers.generateSummary && multi) {
    steps.push("summaryChannels")
  }
  steps.push("translate")
  if (answers.translate) {
    if (multi) {
      steps.push("translationChannels")
    }
    steps.push("targetLanguages")
  }
  steps.push("image")
  if (answers.generateImage && multi) {
    steps.push("imageChannels")
  }
  steps.push("video")
  if (answers.generateVideo && multi) {
    steps.push("videoChannels")
  }
  steps.push("additionalMessage")
  return steps
}

export function validateWorkflowQaStep(
  step: WorkflowQaStepId,
  answers: WorkflowQAAnswers,
  ruleChannelIds: string[],
): string | null {
  const multi = isMultiChannel(ruleChannelIds)
  if (step === "summaryChannels" && answers.generateSummary && multi) {
    if (answers.summaryChannels.length === 0) {
      return "selectAtLeastOneChannel"
    }
  }
  if (step === "imageChannels" && answers.generateImage && multi) {
    if (answers.imageChannels.length === 0) {
      return "selectAtLeastOneChannel"
    }
  }
  if (step === "videoChannels" && answers.generateVideo && multi) {
    if (answers.videoChannels.length === 0) {
      return "selectAtLeastOneChannel"
    }
  }
  if (step === "translationChannels" && answers.translate && multi) {
    if (answers.translationChannels.length === 0) {
      return "selectAtLeastOneChannel"
    }
  }
  if (step === "targetLanguages") {
    if (answers.translate && answers.targetLanguages.length === 0) {
      return "selectAtLeastOneLanguage"
    }
  }
  return null
}

function defaultChannelsForToggle(
  enabled: boolean,
  ruleChannelIds: string[],
): string[] {
  if (!enabled) return []
  return [...ruleChannelIds]
}

export function useWorkflowQaSteps(
  initialMessage = "",
  ruleChannelIds: string[] = [],
) {
  const [answers, setAnswers] = useState<WorkflowQAAnswers>(() =>
    createDefaultWorkflowQAAnswers(initialMessage),
  )
  const [stepIndex, setStepIndex] = useState(0)
  const [channels, setChannels] = useState(ruleChannelIds)

  const steps = useMemo(
    () => buildStepOrder(answers, channels),
    [answers, channels],
  )
  const currentStep = steps[stepIndex] ?? steps[0]
  const isFirst = stepIndex === 0
  const isLast = stepIndex >= steps.length - 1

  const patchAnswers = useCallback((patch: Partial<WorkflowQAAnswers>) => {
    setAnswers((prev) => ({ ...prev, ...patch }))
  }, [])

  const goNext = useCallback(() => {
    const err = validateWorkflowQaStep(currentStep, answers, channels)
    if (err) return err
    setStepIndex((i) => Math.min(i + 1, steps.length - 1))
    return null
  }, [answers, channels, currentStep, steps.length])

  const goBack = useCallback(() => {
    setStepIndex((i) => Math.max(i - 1, 0))
  }, [])

  const reset = useCallback(
    (message = "", nextRuleChannelIds: string[] = channels) => {
      setChannels(nextRuleChannelIds)
      setAnswers(createDefaultWorkflowQAAnswers(message))
      setStepIndex(0)
    },
    [channels],
  )

  const setGenerateSummary = useCallback(
    (generateSummary: boolean) => {
      patchAnswers({
        generateSummary,
        summaryChannels: defaultChannelsForToggle(generateSummary, channels),
      })
    },
    [channels, patchAnswers],
  )

  const setGenerateImage = useCallback(
    (generateImage: boolean) => {
      patchAnswers({
        generateImage,
        imageChannels: defaultChannelsForToggle(generateImage, channels),
      })
    },
    [channels, patchAnswers],
  )

  const setGenerateVideo = useCallback(
    (generateVideo: boolean) => {
      patchAnswers({
        generateVideo,
        videoChannels: defaultChannelsForToggle(generateVideo, channels),
      })
    },
    [channels, patchAnswers],
  )

  const setTranslate = useCallback(
    (translate: boolean) => {
      patchAnswers({
        translate,
        translationChannels: defaultChannelsForToggle(translate, channels),
        ...(translate ? {} : { targetLanguages: [] }),
      })
    },
    [channels, patchAnswers],
  )

  return {
    answers,
    patchAnswers,
    ruleChannelIds: channels,
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
    setStepIndex,
  }
}
