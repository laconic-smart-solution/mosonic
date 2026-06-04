import { useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import { useTranslation } from "react-i18next"
import { RuleChip } from "@/features/rules/components/rule-chip"
import { Button } from "@/components/ui/button"

type WorkflowGenerationProgressProps = {
  step: "started" | "generating" | "failed"
  failureMessage?: string
  onRetry?: () => void
}

const STEP_PROGRESS: Record<WorkflowGenerationProgressProps["step"], number> = {
  started: 30,
  generating: 65,
  failed: 100,
}

const CHIP_KEY: Record<
  WorkflowGenerationProgressProps["step"],
  "generationProgress.chipStarted" | "generationProgress.chipGenerating" | "generationProgress.chipFailed"
> = {
  started: "generationProgress.chipStarted",
  generating: "generationProgress.chipGenerating",
  failed: "generationProgress.chipFailed",
}

export function WorkflowGenerationProgress({
  step,
  failureMessage,
  onRetry,
}: WorkflowGenerationProgressProps) {
  const { t } = useTranslation(["workflow", "common"])
  const target = useMemo(() => STEP_PROGRESS[step], [step])
  const softCap = step === "failed" ? 100 : step === "generating" ? 85 : 55
  const [displayed, setDisplayed] = useState(8)

  useEffect(() => {
    setDisplayed((prev) => Math.max(prev, target))
  }, [target])

  useEffect(() => {
    if (displayed >= softCap) return
    const timer = window.setInterval(() => {
      setDisplayed((prev) => {
        if (prev >= softCap) return prev
        const inc = Math.max(0.25, Math.min(1.6, (softCap - prev) * 0.08))
        return Math.min(softCap, Number((prev + inc).toFixed(2)))
      })
    }, 420)
    return () => window.clearInterval(timer)
  }, [displayed, softCap])

  const progress = Math.round(displayed)
  const isError = step === "failed"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-md rounded-2xl border border-border/70 bg-background/95 p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-foreground">
            {isError
              ? t("generationProgress.titleFailed")
              : t("generationProgress.title")}
          </p>
          <RuleChip
            label={t(CHIP_KEY[step])}
            color={isError ? "gray" : step === "generating" ? "indigo" : "amber"}
          />
        </div>

        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>{t("generationProgress.subtitle")}</span>
          <span>{progress}%</span>
        </div>

        <div className="mb-2 h-2.5 w-full overflow-hidden rounded-full bg-muted/70">
          <motion.div
            className="h-full rounded-full"
            style={{ background: isError ? "#DC2626" : "#00A589" }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.45, ease: "easeOut" }}
          />
        </div>

        <div className="rounded-lg bg-muted/35 p-2">
          {isError ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-red-600">
                {failureMessage ?? t("errors.generateWorkflowFailed")}
              </p>
              {onRetry ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onRetry}
                  className="shrink-0 text-xs"
                >
                  {t("common:actions.retry")}
                </Button>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {step === "generating"
                ? t("generationProgress.aiSelecting")
                : t(`generationProgress.${step}`)}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
