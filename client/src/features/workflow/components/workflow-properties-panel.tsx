import { Button } from "@/components/ui/button"
import { WorkflowNodeConfigFields } from "@/features/workflow/components/workflow-node-config-fields"
import { WF_NODE_TYPES, type WFNode } from "@/features/workflow/data/workflow-model"
import { T } from "@/lib/tokens"

type WorkflowPropertiesPanelProps = {
  selNode: WFNode
  propConfig: Record<string, unknown>
  setPropConfig: (next: Record<string, unknown>) => void
  onClose: () => void
  onApply: () => void
  onReset: () => void
}

export function WorkflowPropertiesPanel({
  selNode,
  propConfig,
  setPropConfig,
  onClose,
  onApply,
  onReset,
}: WorkflowPropertiesPanelProps) {
  const selType =
    WF_NODE_TYPES.find((t) => t.type === selNode.type) ?? WF_NODE_TYPES[0]

  return (
    <div
      className="z-50 flex w-[300px] min-w-[300px] flex-col overflow-hidden border-l bg-white"
      style={{ borderColor: T.surfaceBorder }}
    >
      <div
        className="flex items-center gap-2 border-b px-4 py-3.5"
        style={{ borderColor: T.surfaceBorder }}
      >
        <div
          className="flex size-6 shrink-0 items-center justify-center rounded-md border text-current"
          style={{
            background: selType.bg,
            borderColor: `${selType.color}30`,
            color: selType.color,
          }}
        >
          {selType.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold" style={{ color: T.textPrimary }}>
            {selNode.label}
          </div>
          <div className="text-[10px] text-gray-400">Properties</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex cursor-pointer rounded-md border-none bg-transparent p-1 text-gray-400"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            aria-hidden
          >
            <path
              d="M2 2l10 10M12 2L2 12"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-4 py-3.5">
        <div
          className="rounded-lg border px-2.5 py-2 text-[11px] leading-relaxed"
          style={{ borderColor: T.surfaceBorder, color: T.textSecondary }}
        >
          Tune how this step runs using the fields below. The topic or campaign brief is entered when you
          generate content (pipeline run), not on the node.
        </div>

        <WorkflowNodeConfigFields
          canvasType={selNode.type}
          config={propConfig}
          onChange={setPropConfig}
        />

        <div className="rounded-lg bg-gray-100 px-2.5 py-2 text-[11px] leading-relaxed text-gray-400">
          Changes apply to this run only. Save the workflow to persist.
        </div>
      </div>

      <div
        className="flex gap-2 border-t px-4 py-3"
        style={{ borderColor: T.surfaceBorder }}
      >
        <Button
          type="button"
          className="flex-1"
          size="sm"
          onClick={() => {
            onApply()
            onClose()
          }}
        >
          Apply changes
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onReset}>
          Reset
        </Button>
      </div>
    </div>
  )
}
