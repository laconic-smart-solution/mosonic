import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { workflowConfigsEqual } from "@/features/workflow/lib/config-equality"
import { cn } from "@/lib/utils"
import {
  nodeHasConfigurableSettings,
  WorkflowNodeConfigFields,
} from "@/features/workflow/components/workflow-node-config-fields"
import { WF_NODE_TYPES, type WFNode } from "@/features/workflow/data/workflow-model"
import type { BranchChannelHandle } from "@/features/workflow/lib/branch-channels"

type WorkflowPropertiesPanelProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  selNode: WFNode | null
  propConfig: Record<string, unknown>
  setPropConfig: (next: Record<string, unknown>) => void
  resolvedChannels?: BranchChannelHandle[]
  workflowId?: string
  /** True when this node exists in the saved workflow API payload. */
  nodePersisted?: boolean
  onApply: () => boolean
  onReset: () => void
}

export function WorkflowPropertiesPanel({
  open,
  onOpenChange,
  selNode,
  propConfig,
  setPropConfig,
  resolvedChannels = [],
  workflowId,
  nodePersisted = false,
  onApply,
  onReset,
}: WorkflowPropertiesPanelProps) {
  const { t } = useTranslation("workflow")

  if (!selNode) return null

  const selType =
    WF_NODE_TYPES.find((t) => t.type === selNode.type) ?? WF_NODE_TYPES[0]
  const hasConfigFields = nodeHasConfigurableSettings(selNode.type)
  const hasUnappliedChanges = !workflowConfigsEqual(
    propConfig,
    selNode.config ?? {},
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="flex max-h-[min(90vh,820px)] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
      >
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4">
          <div className="flex items-center gap-3 pr-8">
            <div
              className="flex size-8 shrink-0 items-center justify-center rounded-lg border text-current"
              style={{
                background: selType.bg,
                borderColor: `${selType.color}30`,
                color: selType.color,
              }}
            >
              {selType.icon}
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate">{selNode.label}</DialogTitle>
              <DialogDescription>{t("properties.configuration")}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-5 py-4">
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
              <p className="rounded-lg border border-amber-200 bg-amber-50/80 px-2.5 py-2 text-[11px] text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                {t("properties.branchChannelsHint")}
              </p>
            )
          ) : null}

          <p className="rounded-lg bg-muted px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
            {t("properties.applyHint")}
          </p>
        </div>

        <DialogFooter
          className={cn(
            "shrink-0 gap-2 border-t px-5 py-4 sm:justify-stretch",
            hasUnappliedChanges &&
              "border-teal-400/60 bg-teal-50/90 dark:bg-teal-950/30",
          )}
        >
          <Button
            type="button"
            className={cn(
              "flex-1 font-semibold sm:flex-1",
              hasUnappliedChanges &&
                "bg-teal-600 text-white shadow-md ring-2 ring-teal-400/50 hover:bg-teal-700",
            )}
            size="sm"
            onClick={() => {
              if (onApply()) onOpenChange(false)
            }}
          >
            {hasUnappliedChanges
              ? t("properties.applyChangesNow")
              : t("properties.applyChanges")}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onReset}>
            {t("properties.reset")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function BranchChannelList({
  channels,
}: {
  channels: BranchChannelHandle[]
}) {
  const { t } = useTranslation("workflow")
  return (
    <div className="rounded-lg border border-teal-200 bg-teal-50/80 px-2.5 py-2 dark:border-teal-500/30 dark:bg-teal-950/30">
      <p className="text-[10px] font-bold tracking-wide text-teal-800 uppercase dark:text-teal-300">
        {t("properties.channelLanes")}
      </p>
      <ul className="mt-1.5 space-y-0.5 text-[11px] text-teal-900 dark:text-teal-100">
        {channels.map((ch) => (
          <li key={ch.id}>{ch.label}</li>
        ))}
      </ul>
    </div>
  )
}
