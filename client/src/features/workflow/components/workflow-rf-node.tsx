"use client"

import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import {
  Handle,
  Position,
  useEdges,
  useNodeId,
  useNodes,
  useUpdateNodeInternals,
  type NodeProps,
} from "@xyflow/react"
import type { Node } from "@xyflow/react"

import {
  NODE_H,
  NODE_W,
  WF_NODE_TYPES,
  canvasConfigSummary,
  statusStyle,
  type WfNodeData,
} from "@/features/workflow/data/workflow-model"
import type { BranchChannelHandle } from "@/features/workflow/lib/branch-channels"
import { useWorkflowFlowVisualTheme } from "@/features/workflow/lib/workflow-flow-theme"
import { MediaLoadPlaceholder } from "@/shared/components/media-load-placeholder"
import { useFileObjectUrl } from "@/shared/hooks/use-file-object-url"
import { hasBlockingOutgoingEdge } from "@/features/workflow/lib/workflow-node-validation"
import { cn } from "@/lib/utils"
import { WorkflowNodeAddButton } from "./workflow-node-add-button"
import { WorkflowNodeInfoButton } from "./workflow-node-info-button"
import { WorkflowNodeSettingsButton } from "./workflow-node-settings-button"

type WorkflowRfNodeProps = NodeProps<
  Node<WfNodeData, "wfNode" | "branchNode" | "mergeNode">
>

export function WorkflowRfNode({ data, selected }: WorkflowRfNodeProps) {
  const { t } = useTranslation("workflow")
  const flowTheme = useWorkflowFlowVisualTheme()
  const nodeId = useNodeId()
  const updateNodeInternals = useUpdateNodeInternals()
  const edges = useEdges()
  const allNodes = useNodes()

  const validationNodes = allNodes
    .filter((n) => n.type !== "plus_placeholder")
    .map((n) => ({ id: n.id, data: { wfType: (n.data as WfNodeData).wfType } }))

  const blockingOutgoing = nodeId
    ? hasBlockingOutgoingEdge(nodeId, edges, validationNodes)
    : true

  const showAddButton =
    Boolean(data.onOpenAddPopover) &&
    !data.readOnly &&
    !blockingOutgoing &&
    data.wfType !== "merge"

  const nt = WF_NODE_TYPES.find((t) => t.type === data.wfType) ?? WF_NODE_TYPES[0]
  const sc = statusStyle(data.status)

  const previewImage = useFileObjectUrl(data.previewImage)
  const previewVideo = useFileObjectUrl(data.previewVideo)
  const previewImageSrc =
    previewImage.status === "ready" ? previewImage.src : undefined
  const previewVideoSrc =
    previewVideo.status === "ready" ? previewVideo.src : undefined

  const configSummary = canvasConfigSummary(data.wfType, data.config ?? {})
  const channelHandles =
    (data.channelHandles as BranchChannelHandle[] | undefined) ?? []
  const isBranch = data.wfType === "branch"
  const isMerge = data.wfType === "merge"
  const showLaneHandles =
    channelHandles.length > 0 && (isBranch || isMerge)

  const bodySummary =
    showLaneHandles && isBranch
      ? t("branchNode.channelLanes", { count: channelHandles.length })
      : showLaneHandles && isMerge
        ? t("mergeNode.waitsForLanes", { count: channelHandles.length })
        : configSummary

  const targetHandleStyle = {
    width: 10,
    height: 10,
    background: flowTheme.handleFill,
    border: `2px solid ${nt.color}`,
    boxShadow: `0 0 0 3px ${nt.color}20`,
  }
  const sourceHandleStyle = {
    width: 10,
    height: 10,
    background: nt.color,
    border: `2px solid ${flowTheme.handleRing}`,
    boxShadow: `0 0 0 3px ${nt.color}30, 0 2px 4px ${nt.color}40`,
  }

  useEffect(() => {
    if (nodeId && (isBranch || isMerge)) {
      updateNodeInternals(nodeId)
    }
  }, [
    channelHandles.length,
    isBranch,
    isMerge,
    nodeId,
    showLaneHandles,
    updateNodeInternals,
  ])

  const isWaitingReview = data.status === "waiting_review"

  return (
    <div
      className={cn(
        "relative flex flex-col select-none",
        isWaitingReview && data.onOpenReview && "cursor-pointer",
      )}
      style={{
        width: NODE_W,
        minHeight: isBranch || isMerge ? NODE_H : undefined,
        overflow: showLaneHandles ? "visible" : undefined,
        filter: selected
          ? `drop-shadow(0 0 12px ${nt.color}35)`
          : flowTheme.cardShadow,
      }}
    >
      {data.wfType !== "keywords" && !isBranch ? (
        isMerge && showLaneHandles ? (
          channelHandles.map((ch, index) => {
            const topPct = ((index + 1) / (channelHandles.length + 1)) * 100
            return (
              <Handle
                key={ch.id}
                type="target"
                position={Position.Left}
                id={ch.id}
                style={{
                  ...targetHandleStyle,
                  top: `${topPct}%`,
                }}
                title={ch.label}
              />
            )
          })
        ) : (
          <Handle
            type="target"
            position={Position.Left}
            style={targetHandleStyle}
          />
        )
      ) : null}
      {isBranch ? (
        <Handle
          type="target"
          position={Position.Left}
          style={targetHandleStyle}
        />
      ) : null}

      <div
        className={cn(
          "overflow-hidden rounded-xl border-[1.5px] bg-card transition-[border-color]",
          !selected && "border-border",
        )}
        style={selected ? { borderColor: nt.color } : undefined}
      >
        <div className="h-0.5 shrink-0" style={{ background: nt.color }} />

        <div className="flex items-center gap-2 border-b border-border px-2.5 pt-2.5 pb-2">
          <div
            className="flex size-[26px] shrink-0 items-center justify-center rounded-[7px]"
            style={{
              background: nt.bg,
              border: `1px solid ${nt.color}30`,
              color: nt.color,
            }}
          >
            {nt.icon}
          </div>

          <span className="min-w-0 flex-1 truncate text-xs font-semibold tracking-tight text-foreground">
            {data.label}
          </span>

          {data.lane ? (
            <span
              className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider uppercase"
              style={{
                background: `${nt.color}18`,
                color: nt.color,
                border: `1px solid ${nt.color}40`,
              }}
            >
              {data.lane}
            </span>
          ) : null}

          <div className="flex shrink-0 items-center gap-1">
            <WorkflowNodeInfoButton wfType={data.wfType} />
            {data.onOpenSettings ? (
              <WorkflowNodeSettingsButton
                active={data.settingsOpen}
                onOpen={data.onOpenSettings}
              />
            ) : null}
          </div>

          {data.locked ? (
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              aria-label={t("rfNode.locked")}
              className="shrink-0 opacity-45"
            >
              <rect
                x="2"
                y="5"
                width="8"
                height="6"
                rx="1.5"
                className="stroke-muted-foreground"
                strokeWidth="1.2"
              />
              <path
                d="M4 5V3.5a2 2 0 0 1 4 0V5"
                className="stroke-muted-foreground"
                strokeWidth="1.2"
              />
            </svg>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5 px-2.5 pt-2 pb-2.5">
          {bodySummary ? (
            <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
              {bodySummary}
            </p>
          ) : null}

          {data.processingMessage ? (
            <p className="line-clamp-2 text-[10px] leading-snug text-[var(--nt-blue)]">
              {data.processingMessage}
            </p>
          ) : null}

          {data.errorMessage ? (
            <div className="line-clamp-2 rounded-md border px-1.5 py-1 text-[10px] leading-snug text-[var(--nt-red)] border-[var(--nt-red-border)] bg-[var(--nt-red-bg)]">
              {data.errorMessage}
            </div>
          ) : null}

          {data.previewImage?.trim() && !isWaitingReview ? (
            previewImageSrc ? (
              <img
                src={previewImageSrc}
                alt={t("rfNode.previewAlt")}
                className="max-h-20 w-full rounded-md object-cover"
              />
            ) : (
              <MediaLoadPlaceholder
                progress={previewImage.progress}
                status={previewImage.status === "error" ? "error" : "loading"}
                kind="image"
                compact
                className="rounded-md border border-border bg-muted"
              />
            )
          ) : null}

          {data.previewVideo?.trim() && !isWaitingReview ? (
            previewVideoSrc ? (
              <video
                src={previewVideoSrc}
                className="h-10 w-full rounded-md object-cover"
                muted
                controls
              />
            ) : (
              <MediaLoadPlaceholder
                progress={previewVideo.progress}
                status={previewVideo.status === "error" ? "error" : "loading"}
                kind="video"
                compact
                className="rounded-md border border-border bg-muted"
              />
            )
          ) : null}

          {data.previewText && !isWaitingReview ? (
            <div className="line-clamp-3 rounded-md bg-muted px-1.5 py-1 text-[10px] leading-snug text-muted-foreground">
              {data.previewText}
            </div>
          ) : null}

          {isWaitingReview ? (
            <p className="rounded-md border border-teal-500/30 bg-teal-500/5 px-2 py-1.5 text-[10px] leading-snug text-teal-700 dark:text-teal-400">
              {t("stepMode.clickToReview")}
            </p>
          ) : null}

          <div className="mt-0.5 flex items-center justify-between">
            <span
              className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold"
              style={{
                borderColor: sc.border,
                background: sc.bg,
                color: sc.text,
              }}
            >
              <span
                className="size-[5px] shrink-0 rounded-full"
                style={{ background: sc.dot }}
              />
              {sc.label}
            </span>

            {data.status === "retrying" &&
            data.retryAttempt &&
            data.retryMaxAttempts ? (
              <span className="text-[10px] text-[var(--nt-amber)] tabular-nums">
                {data.retryAttempt}/{data.retryMaxAttempts}
              </span>
            ) : null}

            {data.status === "failed_final" ? (
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => data.onRetry?.()}
                  className="cursor-pointer rounded-[5px] border px-2 py-0.5 text-[10px] font-semibold text-[var(--nt-red)] border-[var(--nt-red-border)] bg-[var(--nt-red-bg)]"
                >
                  {t("rfNode.retry")}
                </button>
                {data.onSkip ? (
                  <button
                    type="button"
                    onClick={() => data.onSkip?.()}
                    className="cursor-pointer rounded-[5px] border px-2 py-0.5 text-[10px] font-semibold text-[var(--nt-amber)] border-[var(--nt-amber-border)] bg-[var(--nt-amber-bg)]"
                  >
                    {t("rfNode.skip")}
                  </button>
                ) : null}
              </div>
            ) : null}

            {data.status === "running" && data.onSkip ? (
              <button
                type="button"
                onClick={() => data.onSkip?.()}
                className="cursor-pointer rounded-[5px] border px-2 py-0.5 text-[10px] font-semibold text-[var(--nt-amber)] border-[var(--nt-amber-border)] bg-[var(--nt-amber-bg)]"
              >
                {t("rfNode.skip")}
              </button>
            ) : null}

            {isWaitingReview && data.onOpenReview ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  data.onOpenReview?.()
                }}
                className="cursor-pointer rounded-[5px] border px-2 py-0.5 text-[10px] font-semibold text-teal-700 border-teal-500/40 bg-teal-500/10 dark:text-teal-400"
              >
                {t("stepMode.openReview")}
              </button>
            ) : null}

            {selected && data.onDelete ? (
              <button
                type="button"
                onClick={() => data.onDelete?.()}
                className="flex size-[22px] shrink-0 cursor-pointer items-center justify-center rounded-[5px] border text-[11px] text-[var(--nt-red)] border-[var(--nt-red-border)] bg-[var(--nt-red-bg)]"
                aria-label={t("rfNode.deleteAria")}
              >
                ✕
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {isBranch && showLaneHandles
        ? channelHandles.map((ch, index) => {
            const topPct = ((index + 1) / (channelHandles.length + 1)) * 100
            return (
              <Handle
                key={ch.id}
                type="source"
                position={Position.Right}
                id={ch.id}
                style={{
                  ...sourceHandleStyle,
                  top: `${topPct}%`,
                }}
                title={ch.label}
              />
            )
          })
        : null}
      {!isBranch || !showLaneHandles ? (
        <Handle
          type="source"
          position={Position.Right}
          style={sourceHandleStyle}
        />
      ) : null}

      <WorkflowNodeAddButton
        visible={showAddButton}
        highlighted={Boolean(data.paletteDropAfterHighlight)}
        active={Boolean(data.paletteDropAfterActive)}
        onOpen={(event) => data.onOpenAddPopover?.(event, nodeId!)}
      />
    </div>
  )
}
