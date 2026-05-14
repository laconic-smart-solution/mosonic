import { Button } from "@/components/ui/button"
import { T } from "@/lib/tokens"

type WorkflowToolbarProps = {
  wfName: string
  onWfNameChange: (v: string) => void
  ruleName?: string
  onRuleClick?: () => void
  /** Empty canvas: toggle structure-generation prompt bar */
  onToggleStructurePrompt?: () => void
  structurePromptOpen?: boolean
  /** Ready canvas: open rebuild dialog */
  onRebuildWorkflow?: () => void
  onRun: () => void
  runLabel?: string
  onSave?: () => void
  isSaving?: boolean
  readOnly?: boolean
  showCancel?: boolean
}

export function WorkflowToolbar({
  wfName,
  onWfNameChange,
  ruleName,
  onRuleClick,
  onToggleStructurePrompt,
  structurePromptOpen,
  onRebuildWorkflow,
  onRun,
  runLabel = "Run Pipeline",
  onSave,
  isSaving,
  readOnly,
  showCancel,
}: WorkflowToolbarProps) {
  return (
    <div
      className="flex h-[52px] min-h-[52px] shrink-0 items-center gap-3 border-b px-4 shadow-[0_1px_0_var(--nt-border)]"
      style={{ background: "white", borderColor: T.surfaceBorder }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <input
          value={wfName}
          onChange={(e) => onWfNameChange(e.target.value)}
          className="max-w-[240px] truncate border-none bg-transparent text-sm font-bold outline-none"
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
        {onRebuildWorkflow && !readOnly ? (
          <Button type="button" variant="outline" size="sm" onClick={onRebuildWorkflow}>
            Rebuild nodes
          </Button>
        ) : null}
        {onToggleStructurePrompt && !readOnly ? (
          <Button
            type="button"
            variant={structurePromptOpen ? "default" : "outline"}
            size="sm"
            onClick={onToggleStructurePrompt}
          >
            Describe workflow
          </Button>
        ) : null}
        {onSave && !readOnly ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onSave}
            disabled={isSaving}
          >
            {isSaving ? "Saving…" : "Save Changes"}
          </Button>
        ) : null}
        {!readOnly ? (
          <Button type="button" size="sm" onClick={() => onRun()} className="gap-1.5">
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              aria-hidden
            >
              <path d="M3 2l7 4-7 4V2z" fill="currentColor" />
            </svg>
            {runLabel}
          </Button>
        ) : null}
        {showCancel ? (
          <Button type="button" size="sm" variant="outline">
            Cancel
          </Button>
        ) : null}
      </div>
    </div>
  )
}
