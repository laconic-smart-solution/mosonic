import { Sparkles } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { T } from "@/lib/tokens"

type WorkflowToolbarProps = {
  wfName: string
  onWfNameChange: (v: string) => void
  onWfNameCommit?: () => void
  ruleName?: string
  onRuleClick?: () => void
  onRun: () => void
  onGenerateWorkflow?: () => void
  runLabel?: string
  onSave?: () => void
  isSaving?: boolean
  readOnly?: boolean
  generationDisabled?: boolean
  generateWorkflowDisabled?: boolean
  workflowGenerationCredits?: number
  showCancel?: boolean
  onCancel?: () => void
}

export function WorkflowToolbar({
  wfName,
  onWfNameChange,
  onWfNameCommit,
  ruleName,
  onRuleClick,
  onRun,
  onGenerateWorkflow,
  runLabel,
  onSave,
  isSaving,
  readOnly,
  generationDisabled = false,
  generateWorkflowDisabled = false,
  workflowGenerationCredits,
  showCancel,
  onCancel,
}: WorkflowToolbarProps) {
  const { t } = useTranslation("workflow")
  const { t: tCredit } = useTranslation("credit")
  const workflowGenLabel =
    workflowGenerationCredits != null && workflowGenerationCredits > 0
      ? tCredit("generationCost", { count: workflowGenerationCredits })
      : null

  return (
    <div
      className="flex h-[52px] min-h-[52px] shrink-0 items-center gap-3 border-b px-4 shadow-[0_1px_0_var(--nt-border)]"
      style={{ background: T.surfaceBg, borderColor: T.surfaceBorder }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Input
          value={wfName}
          onChange={(e) => onWfNameChange(e.target.value)}
          onBlur={() => onWfNameCommit?.()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              e.currentTarget.blur()
            }
          }}
          disabled={readOnly}
          aria-label={t("toolbar.workflowNameAria")}
          placeholder={t("toolbar.untitledWorkflow")}
          className="h-8 max-w-[min(100%,320px)] min-w-[160px] truncate rounded-lg border-transparent bg-muted/40 px-2.5 text-sm font-bold shadow-none focus-visible:border-ring focus-visible:bg-background focus-visible:truncate-none"
          style={{ color: T.textPrimary }}
        />
        {ruleName ? (
          <button
            type="button"
            onClick={onRuleClick}
            className="flex cursor-pointer items-center gap-1 rounded-[20px] border px-2 py-0.5 text-[11px] font-semibold"
            style={{
              background: T.accentLight,
              borderColor: T.accentBorder,
              color: T.accent,
            }}
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 11 11"
              fill="none"
              aria-hidden
            >
              <path
                d="M1 3h9M1 6h6M1 9h8"
                stroke={T.accent}
                strokeWidth="1.3"
                strokeLinecap="round"
              />
            </svg>
            {ruleName}
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden>
              <path
                d="M2 3.5l2.5 3 2.5-3"
                stroke={T.accent}
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        ) : null}
      </div>

      <div className="flex gap-2">
        {onSave && !readOnly ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onSave}
            disabled={isSaving}
          >
            {isSaving ? t("toolbar.saving") : t("toolbar.saveChanges")}
          </Button>
        ) : null}
        {!readOnly && onGenerateWorkflow ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onGenerateWorkflow}
            disabled={generateWorkflowDisabled}
            className="gap-1.5"
          >
            <Sparkles className="size-3.5 shrink-0" aria-hidden />
            {t("toolbar.generateWorkflow")}
            {workflowGenLabel ? (
              <span className="text-[10px] font-normal opacity-80">
                · {workflowGenLabel}
              </span>
            ) : null}
          </Button>
        ) : null}
        {!readOnly ? (
          <Button
            type="button"
            size="sm"
            onClick={() => onRun()}
            disabled={generationDisabled}
            className="gap-1.5"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              aria-hidden
            >
              <path d="M3 2l7 4-7 4V2z" fill="currentColor" />
            </svg>
            {runLabel ?? t("toolbar.runPipeline")}
          </Button>
        ) : null}
        {showCancel && onCancel ? (
          <Button type="button" size="sm" variant="outline" onClick={onCancel}>
            {t("toolbar.stopPipeline")}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
