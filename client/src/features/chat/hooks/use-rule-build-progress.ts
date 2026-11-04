import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

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

export type RuleBuildStep =
  | "idle"
  | "started"
  | "reading_input"
  | "input_processed"
  | "streaming"
  | "completed"
  | "failed"

/**
 * Tracks a Rule's background extraction in real time (reuses the same
 * `rule_${ruleId}` socket room / event set as the standalone rule-creation
 * flow). Once it completes, invalidates every query the chat UI depends on
 * so the brand profile, selector, and sidebar pick up the finished Rule.
 */
export function useRuleBuildProgress() {
  const { t } = useTranslation("chat")
  const queryClient = useQueryClient()
  const [buildingRuleId, setBuildingRuleId] = useState<string | null>(null)
  const [step, setStep] = useState<RuleBuildStep>("idle")
  const [failureMessage, setFailureMessage] = useState("")

  const startTracking = useCallback((ruleId: string) => {
    setBuildingRuleId(ruleId)
    setStep("started")
    setFailureMessage("")
    joinRuleRoom(ruleId)
  }, [])

  useEffect(() => {
    if (!buildingRuleId) return
    const matches = (ruleId: string) => ruleId === buildingRuleId

    const invalidateForFinishedRule = (ruleId: string) => {
      void queryClient.invalidateQueries({ queryKey: ["rule", ruleId] })
      void queryClient.invalidateQueries({ queryKey: ["rules", "pageable"] })
      void queryClient.invalidateQueries({ queryKey: ["chat-sessions", "all"] })
      void queryClient.invalidateQueries({ queryKey: ["chat-sessions", ruleId] })
    }

    const cleanups = [
      onRuleStarted(({ ruleId }) => {
        if (matches(ruleId)) setStep("started")
      }),
      onRuleReadingInput(({ ruleId }) => {
        if (matches(ruleId)) setStep("reading_input")
      }),
      onRuleInputProcessed(({ ruleId }) => {
        if (matches(ruleId)) setStep("input_processed")
      }),
      onRuleStreaming(({ ruleId }) => {
        if (matches(ruleId)) setStep("streaming")
      }),
      onRuleCompleted(({ ruleId }) => {
        if (!matches(ruleId)) return
        setStep("completed")
        invalidateForFinishedRule(ruleId)
        toast.success(t("buildProgress.completedToast"))
        leaveRuleRoom(ruleId)
        setBuildingRuleId(null)
      }),
      onRuleFailed(({ ruleId, message }) => {
        if (!matches(ruleId)) return
        setStep("failed")
        setFailureMessage(message ?? t("buildProgress.failedToast"))
        invalidateForFinishedRule(ruleId)
        leaveRuleRoom(ruleId)
      }),
    ]

    return () => cleanups.forEach((cleanup) => cleanup())
  }, [buildingRuleId, queryClient, t])

  return {
    step,
    isBuilding: Boolean(buildingRuleId) && step !== "failed",
    failureMessage,
    startTracking,
  }
}
