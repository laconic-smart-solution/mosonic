import { Loader2 } from "lucide-react"
import { useTranslation } from "react-i18next"

import type { RuleBuildStep } from "../hooks/use-rule-build-progress"

const STEP_LABEL_KEY: Partial<Record<RuleBuildStep, string>> = {
  started: "buildProgress.started",
  reading_input: "buildProgress.readingInput",
  input_processed: "buildProgress.inputProcessed",
  streaming: "buildProgress.streaming",
}

export function ChatRuleBuildProgress({ step }: { step: RuleBuildStep }) {
  const { t } = useTranslation("chat")
  const labelKey = STEP_LABEL_KEY[step]
  if (!labelKey) return null

  return (
    <div
      className="flex items-center gap-2 border-t border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground"
      aria-live="polite"
    >
      <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" aria-hidden />
      {t(labelKey)}
    </div>
  )
}
