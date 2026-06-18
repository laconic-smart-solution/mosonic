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
import { MediaLoadPlaceholder } from "@/shared/components/media-load-placeholder"
import { useFileObjectUrl } from "@/shared/hooks/use-file-object-url"
import { hasBlockingOutgoingEdge } from "@/features/workflow/lib/workflow-node-validation"
import { WorkflowNodeAddButton } from "./workflow-node-add-button"
import { WorkflowNodeSettingsButton } from "./workflow-node-settings-button"

type WorkflowRfNodeProps = NodeProps<
  Node<WfNodeData, "wfNode" | "branchNode" | "mergeNode">
>

export function WorkflowRfNode({ data, selected }: WorkflowRfNodeProps) {
  const { t } = useTranslation("workflow")
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
    background: "#fff",
    border: `2px solid ${nt.color}`,
    boxShadow: `0 0 0 3px ${nt.color}20`,
  }
  const sourceHandleStyle = {
    width: 10,
    height: 10,
    background: nt.color,
    border: "2px solid #fff",
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

  return (
    <div
      className="relative flex flex-col select-none"
      style={{
        width: NODE_W,
        minHeight: isBranch || isMerge ? NODE_H : undefined,
        overflow: showLaneHandles ? "visible" : undefined,
        filter: selected
          ? `drop-shadow(0 0 12px ${nt.color}35)`
          : "drop-shadow(0 2px 6px rgba(0,0,0,0.08))",
      }}
    >
      {/* LEFT HANDLE(S) */}
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

      {/* CARD */}
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          border: `1.5px solid ${selected ? nt.color : "#E5E1D8"}`,
          overflow: "hidden",
          transition: "border-color 0.15s",
        }}
      >
        {/* ACCENT LINE */}
        <div style={{ height: 2, background: nt.color, flexShrink: 0 }} />

        {/* HEADER */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "9px 10px 8px",
            borderBottom: "1px solid #F0EDE8",
          }}
        >
          {/* Icon */}
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 7,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: nt.bg,
              border: `1px solid ${nt.color}30`,
              color: nt.color,
              flexShrink: 0,
            }}
          >
            {nt.icon}
          </div>

          {/* Label */}
          <span
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 12,
              fontWeight: 600,
              color: "#0F1F3D",
              letterSpacing: "-0.01em",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {data.label}
          </span>

          {/* Lane pill */}
          {data.lane && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.07em",
                textTransform: "uppercase",
                padding: "2px 6px",
                borderRadius: 4,
                background: `${nt.color}18`,
                color: nt.color,
                border: `1px solid ${nt.color}40`,
                flexShrink: 0,
              }}
            >
              {data.lane}
            </span>
          )}

          {data.onOpenSettings ? (
            <WorkflowNodeSettingsButton
              active={data.settingsOpen}
              onOpen={data.onOpenSettings}
            />
          ) : null}

          {/* Lock icon */}
          {data.locked && (
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              aria-label={t("rfNode.locked")}
              style={{ flexShrink: 0, opacity: 0.45 }}
            >
              <rect x="2" y="5" width="8" height="6" rx="1.5" stroke="#4A5568" strokeWidth="1.2" />
              <path d="M4 5V3.5a2 2 0 0 1 4 0V5" stroke="#4A5568" strokeWidth="1.2" />
            </svg>
          )}
        </div>

        {/* BODY */}
        <div style={{ padding: "8px 10px 10px", display: "flex", flexDirection: "column", gap: 7 }}>

          {/* Config summary */}
          {bodySummary ? (
            <p
              style={{
                fontSize: 11,
                lineHeight: 1.55,
                color: "#857A6C",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {bodySummary}
            </p>
          ) : null}

          {/* Processing message */}
          {data.processingMessage && (
            <p
              style={{
                fontSize: 10,
                lineHeight: 1.5,
                color: "#2563EB",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {data.processingMessage}
            </p>
          )}

          {/* Error message */}
          {data.errorMessage && (
            <div
              style={{
                fontSize: 10,
                lineHeight: 1.5,
                color: "#DC2626",
                background: "#FEF2F2",
                border: "1px solid #FECACA",
                borderRadius: 6,
                padding: "5px 7px",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {data.errorMessage}
            </div>
          )}

          {/* Image preview */}
          {data.previewImage?.trim() ? (
            previewImageSrc ? (
              <img
                src={previewImageSrc}
                alt={t("rfNode.previewAlt")}
                style={{
                  width: "100%",
                  borderRadius: 6,
                  objectFit: "cover",
                  maxHeight: 80,
                }}
              />
            ) : (
              <MediaLoadPlaceholder
                progress={previewImage.progress}
                status={previewImage.status === "error" ? "error" : "loading"}
                kind="image"
                compact
                className="rounded-md border border-[#F0EDE8] bg-[#FAF9F7]"
              />
            )
          ) : null}

          {/* Video preview */}
          {data.previewVideo?.trim() ? (
            previewVideoSrc ? (
              <video
                src={previewVideoSrc}
                style={{
                  width: "100%",
                  height: 40,
                  borderRadius: 6,
                  objectFit: "cover",
                }}
                muted
                controls
              />
            ) : (
              <MediaLoadPlaceholder
                progress={previewVideo.progress}
                status={previewVideo.status === "error" ? "error" : "loading"}
                kind="video"
                compact
                className="rounded-md border border-[#F0EDE8] bg-[#FAF9F7]"
              />
            )
          ) : null}

          {/* Text preview */}
          {data.previewText && (
            <div
              style={{
                fontSize: 10,
                lineHeight: 1.6,
                color: "#62594E",
                background: "#F7F4EF",
                borderRadius: 6,
                padding: "5px 7px",
                display: "-webkit-box",
                WebkitLineClamp: 3,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {data.previewText}
            </div>
          )}

          {/* FOOTER ROW: status + retry/skip + delete */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>

            {/* Status badge */}
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 10,
                fontWeight: 600,
                padding: "3px 7px",
                borderRadius: 20,
                border: `1px solid ${sc.border}`,
                background: sc.bg,
                color: sc.text,
              }}
            >
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: sc.dot,
                  flexShrink: 0,
                }}
              />
              {sc.label}
            </span>

            {/* Retry attempt counter */}
            {data.status === "retrying" && data.retryAttempt && data.retryMaxAttempts && (
              <span style={{ fontSize: 10, color: "#EA580C", fontVariantNumeric: "tabular-nums" }}>
                {data.retryAttempt}/{data.retryMaxAttempts}
              </span>
            )}

            {/* Retry / Skip buttons on final failure */}
            {data.status === "failed_final" && (
              <div style={{ display: "flex", gap: 4 }}>
                <button
                  type="button"
                  onClick={() => data.onRetry?.()}
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    padding: "3px 8px",
                    borderRadius: 5,
                    border: "1px solid #FECACA",
                    background: "#FEF2F2",
                    color: "#DC2626",
                    cursor: "pointer",
                  }}
                >
                  {t("rfNode.retry")}
                </button>
                {data.onSkip && (
                  <button
                    type="button"
                    onClick={() => data.onSkip?.()}
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      padding: "3px 8px",
                      borderRadius: 5,
                      border: "1px solid #FCD34D",
                      background: "#FFFBEB",
                      color: "#92400E",
                      cursor: "pointer",
                    }}
                  >
                    {t("rfNode.skip")}
                  </button>
                )}
              </div>
            )}

            {/* Delete button when selected */}
            {selected && data.onDelete && (
              <button
                type="button"
                onClick={() => data.onDelete?.()}
                style={{
                  width: 22,
                  height: 22,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 5,
                  border: "1px solid #FECACA",
                  background: "#FEF2F2",
                  color: "#DC2626",
                  fontSize: 11,
                  cursor: "pointer",
                  flexShrink: 0,
                }}
                aria-label={t("rfNode.deleteAria")}
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* RIGHT HANDLE(S) */}
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