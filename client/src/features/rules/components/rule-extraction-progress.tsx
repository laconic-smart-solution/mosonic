import { useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import { RuleChip } from "./rule-chip"

type RuleExtractionProgressProps = {
  ruleId: string
  progressStep: string
  failureMessage: string
  streamedContent: string
}

export function RuleExtractionProgress({
  ruleId: _ruleId,
  progressStep,
  failureMessage,
  streamedContent,
}: RuleExtractionProgressProps) {
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
  const title = failureMessage ? "Rule generation failed" : "Generating your rule"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-md rounded-2xl border border-border/70 bg-background/95 p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <RuleChip label={progressStep.replace("_", " ")} color="amber" />
        </div>
        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>Rule extraction</span>
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
              {streamedContent || "Please wait while we process your prompt..."}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
