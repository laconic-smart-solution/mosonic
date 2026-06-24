import { Sparkles, Workflow } from "lucide-react"

import { cn } from "@/lib/utils"

export type WorkflowPromptMode = "useCurrentWorkflow" | "generateWorkflow"

type WorkflowPromptModeSwitchProps = {
  value: WorkflowPromptMode
  onChange: (value: WorkflowPromptMode) => void
  useCurrentLabel: string
  autoGenerateLabel: string
  useCurrentTitle?: string
  autoGenerateTitle?: string
  useCurrentDisabled?: boolean
  className?: string
}

export function WorkflowPromptModeSwitch({
  value,
  onChange,
  useCurrentLabel,
  autoGenerateLabel,
  useCurrentTitle,
  autoGenerateTitle,
  useCurrentDisabled = false,
  className,
}: WorkflowPromptModeSwitchProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-lg border border-border/70 bg-muted/40 p-0.5",
        className,
      )}
      role="tablist"
      aria-label="Workflow generation mode"
    >
      <button
        type="button"
        role="tab"
        aria-selected={value === "useCurrentWorkflow"}
        title={useCurrentTitle ?? useCurrentLabel}
        disabled={useCurrentDisabled}
        onClick={() => onChange("useCurrentWorkflow")}
        className={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium transition-all duration-150",
          value === "useCurrentWorkflow"
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
          useCurrentDisabled && "cursor-not-allowed opacity-40",
        )}
      >
        <Workflow className="size-3.5 shrink-0" aria-hidden />
        <span>{useCurrentLabel}</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={value === "generateWorkflow"}
        title={autoGenerateTitle ?? autoGenerateLabel}
        onClick={() => onChange("generateWorkflow")}
        className={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium transition-all duration-150",
          value === "generateWorkflow"
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Sparkles className="size-3.5 shrink-0" aria-hidden />
        <span>{autoGenerateLabel}</span>
      </button>
    </div>
  )
}
