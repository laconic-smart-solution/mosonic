import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { workflowConfigsEqual } from "@/features/workflow/lib/config-equality"
import { cn } from "@/lib/utils"
import {
  getWorkflowNodeFieldDefs,
  WorkflowNodeConfigFields,
} from "@/features/workflow/components/workflow-node-config-fields"
import { WorkflowNodeGuideSection } from "@/features/workflow/components/workflow-node-guide-section"
import { WF_NODE_TYPES, type WFNode } from "@/features/workflow/data/workflow-model"
import type { BranchChannelHandle } from "@/features/workflow/lib/branch-channels"
import { T } from "@/lib/tokens"

type WorkflowPropertiesPanelProps = {
  selNode: WFNode
  propConfig: Record<string, unknown>
  setPropConfig: (next: Record<string, unknown>) => void
  resolvedChannels?: BranchChannelHandle[]
  workflowId?: string
  /** True when this node exists in the saved workflow API payload. */
  nodePersisted?: boolean
  onClose: () => void
  onApply: () => boolean
  onReset: () => void
}

export function WorkflowPropertiesPanel({
  selNode,
  propConfig,
  setPropConfig,
  resolvedChannels = [],
  workflowId,
  nodePersisted = false,
  onClose,
  onApply,
  onReset,
}: WorkflowPropertiesPanelProps) {
  const { t, i18n } = useTranslation("workflow")
  const fieldDefs = useMemo(
    () => getWorkflowNodeFieldDefs(),
    [i18n.language],
  )
  const selType =
    WF_NODE_TYPES.find((t) => t.type === selNode.type) ?? WF_NODE_TYPES[0]
  const hasConfigFields = (fieldDefs[selNode.type] ?? []).length > 0
  const hasUnappliedChanges = !workflowConfigsEqual(
    propConfig,
    selNode.config ?? {},
  )

  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden border-l bg-card shadow-lg"
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
          <div className="text-[10px] text-gray-400">{t("properties.title")}</div>
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
        <WorkflowNodeGuideSection canvasType={selNode.type} />

        {hasConfigFields ? (
          <div className="rounded-xl border border-border/60 bg-muted/15 p-3.5">
            <p className="mb-3 text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
              {t("properties.configuration")}
            </p>
            <WorkflowNodeConfigFields
              canvasType={selNode.type}
              config={propConfig}
              onChange={setPropConfig}
              workflowId={workflowId}
              nodeId={selNode.id}
              persistPresenterToServer={nodePersisted}
            />
          </div>
        ) : null}

        {selNode.type === "branch" ? (
          resolvedChannels.length > 0 ? (
            <BranchChannelList channels={resolvedChannels} />
          ) : (
            <p className="rounded-lg border border-amber-200 bg-amber-50/80 px-2.5 py-2 text-[11px] text-amber-900">
              {t("properties.branchChannelsHint")}
            </p>
          )
        ) : null}

        <div className="rounded-lg bg-gray-100 px-2.5 py-2 text-[11px] leading-relaxed text-gray-400">
          {t("properties.applyHint")}
        </div>
      </div>

      <div
        className={cn(
          "flex gap-2 border-t px-4 py-3 transition-colors",
          hasUnappliedChanges &&
            "border-teal-400/60 bg-teal-50/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]",
        )}
        style={{ borderColor: hasUnappliedChanges ? undefined : T.surfaceBorder }}
      >
        <Button
          type="button"
          className={cn(
            "flex-1 font-semibold",
            hasUnappliedChanges &&
              "bg-teal-600 text-white shadow-md ring-2 ring-teal-400/50 hover:bg-teal-700",
          )}
          size="sm"
          onClick={() => {
            if (onApply()) onClose()
          }}
        >
          {hasUnappliedChanges
            ? t("properties.applyChangesNow")
            : t("properties.applyChanges")}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onReset}>
          {t("properties.reset")}
        </Button>
      </div>
    </div>
  )
}

function BranchChannelList({
  channels,
}: {
  channels: BranchChannelHandle[]
}) {
  const { t } = useTranslation("workflow")
  return (
    <div className="rounded-lg border border-teal-200 bg-teal-50/80 px-2.5 py-2">
      <p className="text-[10px] font-bold tracking-wide text-teal-800 uppercase">
        {t("properties.channelLanes")}
      </p>
      <ul className="mt-1.5 space-y-0.5 text-[11px] text-teal-900">
        {channels.map((ch) => (
          <li key={ch.id}>{ch.label}</li>
        ))}
      </ul>
    </div>
  )
}
