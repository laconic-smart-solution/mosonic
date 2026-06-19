import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { RuleChip } from "./rule-chip"

type RuleExtractionProgressProps = {
  ruleId: string
  progressStep: string
  failureMessage: string
  streamedContent: string
  translationNamespace?: string
  title?: string
  subtitle?: string
  onDismiss?: () => void
  onTryAgain?: () => void
}

export function RuleExtractionProgress({
  ruleId: _ruleId,
  progressStep,
  failureMessage,
  streamedContent,
  translationNamespace = "rules",
  title,
  subtitle,
  onDismiss,
  onTryAgain,
}: RuleExtractionProgressProps) {
  const { t } = useTranslation(translationNamespace)
  const [displayedProgress, setDisplayedProgress] = useState(8)
  const stepToProgress = useMemo(
    () =>
      ({
        idle: 8,
        started: 25,
        reading_input: 38,
        input_processed: 50,
        streaming: 78,
        completed: 100,
        failed: 100,
      }) as const,
    [],
  )
  const backendProgress = stepToProgress[progressStep as keyof typeof stepToProgress] ?? 12

  const softCap = useMemo(() => {
    if (progressStep === "completed" || progressStep === "failed" || failureMessage) return 100
    if (progressStep === "streaming") return 90
    if (progressStep === "input_processed") return 82
    if (progressStep === "reading_input") return 74
    if (progressStep === "started") return 68
    return 45
  }, [failureMessage, progressStep])

  useEffect(() => {
    setDisplayedProgress((prev) => Math.max(prev, backendProgress))
  }, [backendProgress])

  useEffect(() => {
    if (displayedProgress >= softCap) return
    const timer = window.setInterval(() => {
      setDisplayedProgress((prev) => {
        if (prev >= softCap) return prev
        const remaining = softCap - prev
        const increment = Math.max(0.25, Math.min(1.6, remaining * 0.08))
        return Math.min(softCap, Number((prev + increment).toFixed(2)))
      })
    }, 420)
    return () => window.clearInterval(timer)
  }, [displayedProgress, softCap])

  const progress = Math.round(displayedProgress)
  const resolvedTitle = failureMessage
    ? title ?? t("extraction.titleFailed")
    : title ?? t("extraction.titleGenerating")
  const resolvedSubtitle = subtitle ?? t("extraction.subtitle")
  const stepLabel = t(`progressStep.${progressStep}`, {
    defaultValue: progressStep.replace(/_/g, " "),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-md rounded-2xl border border-border/70 bg-background/95 p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-foreground">{resolvedTitle}</p>
          <RuleChip label={stepLabel} color="amber" />
        </div>
        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>{resolvedSubtitle}</span>
          <span>{progress}%</span>
        </div>
        <div className="mb-2 h-2.5 w-full overflow-hidden rounded-full bg-muted/70">
          <motion.div
            className="h-full rounded-full bg-primary"
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.45, ease: "easeOut" }}
          />
        </div>
        <div className="rounded-lg bg-muted/35 p-2">
          {failureMessage ? (
            <p className="text-xs text-red-600">{failureMessage}</p>
          ) : (
            <p className="line-clamp-3 text-xs text-muted-foreground">
              {streamedContent || t("extraction.waitMessage")}
            </p>
          )}
        </div>
        {failureMessage && (onDismiss || onTryAgain) ? (
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            {onDismiss ? (
              <Button type="button" variant="outline" size="sm" onClick={onDismiss}>
                {t("extraction.dismiss")}
              </Button>
            ) : null}
            {onTryAgain ? (
              <Button type="button" size="sm" onClick={onTryAgain}>
                {t("extraction.tryAgain")}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
