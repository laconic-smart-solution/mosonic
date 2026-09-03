import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import type { Attachment } from "@/components/core/prompt-area"
import type { RuleIntakeAnswers } from "@/features/rules/types/rule-intake.type"
import {
  formatMaxFileSizeMb,
  RULE_EXTRACT_MAX_FILE_BYTES,
} from "@/lib/rule-extract-limits"
import { buildRuleExtractFormData } from "@/lib/strategy-input"
import { getApiErrorMessage, isInsufficientCredits } from "@/shared/lib/api-error"
import { toastApiError } from "@/shared/lib/toast-error"
import { useExtractRuleMutation } from "@/shared/queries/rule.query"
import {
  joinRuleRoom,
  leaveRuleRoom,
  onRuleCompleted,
  onRuleFailed,
  onRuleInputProcessed,
  onRuleReadingInput,
  onRuleStarted,
  onRuleStreaming,
} from "@/shared/socket/rule-events"

export type RuleExtractionProgressStep =
  | "idle"
  | "started"
  | "reading_input"
  | "input_processed"
  | "streaming"
  | "completed"
  | "failed"

type UseRuleExtractionOptions = {
  i18nNamespace?: string
  showExtractionStartedToast?: boolean
  onExtractStarted?: (ruleId: string, previewLabel: string) => void
  onCompleted?: (ruleId: string) => void | Promise<void>
  onFailed?: (ruleId: string, message: string) => void
}

export function useRuleExtraction(options: UseRuleExtractionOptions = {}) {
  const {
    i18nNamespace = "rules",
    showExtractionStartedToast = true,
    onExtractStarted,
    onCompleted,
    onFailed,
  } = options

  const { t } = useTranslation(i18nNamespace)
  const queryClient = useQueryClient()
  const extractRuleMutation = useExtractRuleMutation()

  const [processingRuleId, setProcessingRuleId] = useState<string | null>(null)
  const [progressStep, setProgressStep] =
    useState<RuleExtractionProgressStep>("idle")
  const [streamedContent, setStreamedContent] = useState("")
  const [failureMessage, setFailureMessage] = useState("")

  const showOverlay = useMemo(
    () =>
      Boolean(processingRuleId) ||
      (progressStep === "failed" && Boolean(failureMessage)),
    [failureMessage, processingRuleId, progressStep],
  )

  const isExtracting = Boolean(processingRuleId) && progressStep !== "failed"

  const reset = useCallback(() => {
    setProcessingRuleId(null)
    setProgressStep("idle")
    setFailureMessage("")
    setStreamedContent("")
  }, [])

  const dismissFailure = useCallback(() => {
    const failedRuleId = processingRuleId
    reset()
    if (failedRuleId) leaveRuleRoom(failedRuleId)
  }, [processingRuleId, reset])

  const hydrateCompletedRule = useCallback(
    async (ruleId: string) => {
      setProgressStep("completed")
      await onCompleted?.(ruleId)
      setProcessingRuleId(null)
      leaveRuleRoom(ruleId)
    },
    [onCompleted],
  )

  useEffect(() => {
    if (!processingRuleId) return

    const cleanupStarted = onRuleStarted(({ ruleId }) => {
      if (ruleId !== processingRuleId) return
      setProgressStep("started")
    })

    const cleanupReadingInput = onRuleReadingInput(({ ruleId }) => {
      if (ruleId !== processingRuleId) return
      setProgressStep("reading_input")
    })

    const cleanupInputProcessed = onRuleInputProcessed(({ ruleId }) => {
      if (ruleId !== processingRuleId) return
      setProgressStep("input_processed")
    })

    const cleanupStreaming = onRuleStreaming(({ ruleId, chunk }) => {
      if (ruleId !== processingRuleId) return
      setProgressStep("streaming")
      setStreamedContent((prev) => `${prev}${prev ? " " : ""}${chunk}`)
    })

    const cleanupCompleted = onRuleCompleted(({ ruleId }) => {
      if (ruleId !== processingRuleId) return
      void hydrateCompletedRule(ruleId)
    })

    const cleanupFailed = onRuleFailed(({ ruleId, message }) => {
      if (ruleId !== processingRuleId) return
      const resolvedMessage = message ?? t("toast.generationFailed")
      setProgressStep("failed")
      setFailureMessage(resolvedMessage)
      void queryClient.invalidateQueries({ queryKey: ["rules", "pageable"] })
      void queryClient.invalidateQueries({ queryKey: ["rule", ruleId] })
      leaveRuleRoom(ruleId)
      onFailed?.(ruleId, resolvedMessage)
    })

    return () => {
      cleanupStarted()
      cleanupReadingInput()
      cleanupInputProcessed()
      cleanupStreaming()
      cleanupCompleted()
      cleanupFailed()
    }
  }, [hydrateCompletedRule, onFailed, processingRuleId, queryClient, t])

  const runExtract = useCallback(
    async (
      text: string,
      attachments: Attachment[],
      intake?: RuleIntakeAnswers,
    ) => {
      const trimmed = text.trim()
      const hasFile = attachments.some(
        (a) => a.type === "file" && a.data instanceof File,
      )
      const hasUrl = attachments.some((a) => a.type === "url")
      if (!trimmed && !hasFile && !hasUrl) return

      for (const a of attachments) {
        if (a.type === "file" && a.data instanceof File) {
          if (a.data.size > RULE_EXTRACT_MAX_FILE_BYTES) {
            const msg = t("toast.fileTooLarge", {
              name: a.label,
              maxMb: formatMaxFileSizeMb(RULE_EXTRACT_MAX_FILE_BYTES),
            })
            toast.error(msg)
            setProgressStep("failed")
            setFailureMessage(msg)
            return
          }
        }
      }

      try {
        const formData = buildRuleExtractFormData(text, attachments, intake)
        const { ruleId } = await extractRuleMutation.mutateAsync(formData)
        const previewLabel =
          trimmed ||
          attachments
            .map((a) => a.label)
            .filter(Boolean)
            .join(", ") ||
          t("page.attachmentsFallback", { defaultValue: "Attachments" })

        onExtractStarted?.(ruleId, previewLabel)
        setProcessingRuleId(ruleId)
        setProgressStep("idle")
        setFailureMessage("")
        setStreamedContent("")
        joinRuleRoom(ruleId)

        if (showExtractionStartedToast) {
          toast.success(t("toast.extractionStarted"))
        }
      } catch (err) {
        if (isInsufficientCredits(err)) {
          toastApiError(err, "credit:runConfirm.insufficientTitle")
          setProgressStep("failed")
          setFailureMessage(
            getApiErrorMessage(err, t("toast.couldNotStartExtraction")),
          )
          return
        }
        const message = getApiErrorMessage(
          err,
          t("toast.couldNotStartExtraction"),
        )
        setProgressStep("failed")
        setFailureMessage(message)
        toastApiError(err, "rules:toast.couldNotStartExtraction")
      }
    },
    [extractRuleMutation, onExtractStarted, showExtractionStartedToast, t],
  )

  return {
    processingRuleId,
    progressStep,
    failureMessage,
    streamedContent,
    showOverlay,
    isExtracting,
    runExtract,
    reset,
    dismissFailure,
    isPending: extractRuleMutation.isPending,
  }
}
