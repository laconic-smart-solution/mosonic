import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
import {
  normalizeLaneId,
  type BranchChannelHandle,
  type BranchNodeConfig,
} from "@/features/workflow/lib/branch-channels"

type WorkflowPropertiesPanelProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  selNode: WFNode | null
  propConfig: Record<string, unknown>
  setPropConfig: (next: Record<string, unknown>) => void
  /** Every channel the app publishes to — the checklist's full option list. */
  allChannels?: BranchChannelHandle[]
  /** Channels currently active in this workflow (Rule channels, or an explicit wizard_channels selection) — the checklist's initial checked state. */
  activeChannels?: BranchChannelHandle[]
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
  allChannels = [],
  activeChannels,
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
            allChannels.length > 0 ? (
              <BranchChannelPicker
                allChannels={allChannels}
                activeChannels={activeChannels ?? allChannels}
                config={propConfig as BranchNodeConfig}
                onChange={setPropConfig}
              />
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

/**
 * Branching is optional — a workflow may intentionally run fewer channels
 * than the Rule defines. Unchecking a channel here removes its lane the
 * moment changes are applied; at least one channel must stay active (a
 * Branch node with zero lanes doesn't mean anything — delete Branch/Merge
 * entirely for that instead).
 */
function BranchChannelPicker({
  allChannels,
  activeChannels,
  config,
  onChange,
}: {
  allChannels: BranchChannelHandle[]
  activeChannels: BranchChannelHandle[]
  config: BranchNodeConfig
  onChange: (next: Record<string, unknown>) => void
}) {
  const { t } = useTranslation("workflow")
  const activeIds = new Set(
    config?.mode === "wizard_channels" && Array.isArray(config.channels)
      ? config.channels.map(normalizeLaneId)
      : activeChannels.map((ch) => ch.id),
  )

  function toggle(channelId: string, checked: boolean) {
    const nextIds = new Set(activeIds)
    if (checked) {
      nextIds.add(channelId)
    } else {
      if (nextIds.size <= 1) return
      nextIds.delete(channelId)
    }
    onChange({
      mode: "wizard_channels",
      channels: allChannels.map((ch) => ch.id).filter((id) => nextIds.has(id)),
    } satisfies BranchNodeConfig)
  }

  return (
    <div className="rounded-lg border border-teal-200 bg-teal-50/80 p-3 dark:border-teal-500/30 dark:bg-teal-950/30">
  {/* Header */}
  <div className="mb-3">
    <p className="text-xs font-semibold uppercase tracking-wide text-teal-800 dark:text-teal-300">
      {t("properties.channelLanes")}
    </p>

    <p className="mt-1 max-w-2xl text-xs leading-relaxed text-teal-800/75 dark:text-teal-300/75">
      {t("properties.channelLanesHint")}
    </p>
  </div>

  {/* Channels */}
  <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
    {allChannels.map((ch) => {
      const checked = activeIds.has(ch.id)
      const id = `branch-channel-${ch.id}`
      const disabled = checked && activeIds.size <= 1

      return (
        <li key={ch.id}>
          <label
            htmlFor={id}
            className={[
              "flex min-h-10 items-center gap-3 rounded-md border px-3 py-2",
              "text-sm font-medium transition-all",
              "select-none",
              checked
                ? "border-teal-400 bg-white text-teal-900 shadow-sm dark:border-teal-600 dark:bg-teal-900/40 dark:text-teal-100"
                : "border-teal-200/80 bg-white/60 text-teal-800 hover:border-teal-300 hover:bg-white dark:border-teal-800/60 dark:bg-teal-950/20 dark:text-teal-200 dark:hover:border-teal-700 dark:hover:bg-teal-900/30",
              disabled
                ? "cursor-not-allowed opacity-60"
                : "cursor-pointer",
            ].join(" ")}
          >
            <Checkbox
              id={id}
              checked={checked}
              disabled={disabled}
              onCheckedChange={(next) => toggle(ch.id, Boolean(next))}
              className="shrink-0"
            />

            <span className="min-w-0 truncate">
              {ch.label}
            </span>
          </label>
        </li>
      )
    })}
  </ul>
</div>
  )
}
