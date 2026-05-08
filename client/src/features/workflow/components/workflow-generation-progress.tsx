import { useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import { RuleChip } from "@/features/rules/components/rule-chip"
import { Button } from "@/components/ui/button"

type WorkflowGenerationProgressProps = {
  step: "started" | "generating" | "failed"
  failureMessage?: string
  onRetry?: () => void
}

const STEP_DETAIL: Record<WorkflowGenerationProgressProps["step"], string> = {
  started: "Preparing your workflow…",
  generating: "Building your workflow…",
  failed: "Generation failed",
}

const STEP_CHIP_LABEL: Record<WorkflowGenerationProgressProps["step"], string> = {
  started: "started",
  generating: "generating",
  failed: "failed",
}

const STEP_PROGRESS: Record<WorkflowGenerationProgressProps["step"], number> = {
  started: 30,
  generating: 65,
  failed: 100,
}

export function WorkflowGenerationProgress({
  step,
  failureMessage,
  onRetry,
}: WorkflowGenerationProgressProps) {
  const target = useMemo(() => STEP_PROGRESS[step], [step])
  const softCap = step === "failed" ? 100 : step === "generating" ? 85 : 55
  const [displayed, setDisplayed] = useState(8)

  useEffect(() => {
    setDisplayed((prev) => Math.max(prev, target))
  }, [target])

  useEffect(() => {
    if (displayed >= softCap) return
    const t = window.setInterval(() => {
      setDisplayed((prev) => {
        if (prev >= softCap) return prev
        const inc = Math.max(0.25, Math.min(1.6, (softCap - prev) * 0.08))
        return Math.min(softCap, Number((prev + inc).toFixed(2)))
      })
    }, 420)
    return () => window.clearInterval(t)
  }, [displayed, softCap])

  const progress = Math.round(displayed)
  const isError = step === "failed"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-md rounded-2xl border border-border/70 bg-background/95 p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-foreground">
            {isError ? "Workflow generation failed" : "Generating your workflow"}
          </p>
          <RuleChip
            label={STEP_CHIP_LABEL[step]}
            color={isError ? "gray" : step === "generating" ? "indigo" : "amber"}
          />
        </div>

        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>Workflow generation</span>
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
                {failureMessage ?? "Could not generate workflow. Please try again."}
              </p>
              {onRetry ? (
                <Button type="button" variant="outline" size="sm" onClick={onRetry} className="shrink-0 text-xs">
                  Retry
                </Button>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {step === "generating"
                ? "AI is selecting the best nodes for your content…"
                : STEP_DETAIL.started}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
