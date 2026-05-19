import { useEffect } from "react"
import {
  Handle,
  Position,
  useNodeId,
  useUpdateNodeInternals,
  type NodeProps,
} from "@xyflow/react"

import {
  NODE_W,
  statusStyle,
  type WfNodeData,
} from "@/features/workflow/data/workflow-model"
import type { Node } from "@xyflow/react"
import type { BranchChannelHandle } from "@/features/workflow/lib/branch-channels"
import { T } from "@/lib/tokens"

const MERGE_COLOR = "#64748B"
const MERGE_BG = "#F1F5F9"

export function WorkflowMergeNode({
  data,
  selected,
}: NodeProps<Node<WfNodeData, "mergeNode">>) {
  const nodeId = useNodeId()
  const updateNodeInternals = useUpdateNodeInternals()
  const handles: BranchChannelHandle[] =
    (data.channelHandles as BranchChannelHandle[] | undefined) ?? []
  const sc = statusStyle(data.status)
  const showHandles = handles.length > 0

  useEffect(() => {
    if (nodeId) updateNodeInternals(nodeId)
  }, [handles.length, nodeId, showHandles, updateNodeInternals])

  return (
    <div
      className="relative flex flex-col overflow-visible rounded-xl border-[1.5px] bg-white transition-[border-color,box-shadow] duration-150 select-none"
      style={{
        width: NODE_W,
        minHeight: 88,
        borderColor: selected ? MERGE_COLOR : sc.border || T.surfaceBorder,
        boxShadow: selected
          ? `0 0 0 3px ${MERGE_COLOR}20, 0 4px 16px rgba(0,0,0,0.08)`
          : "0 2px 8px rgba(0,0,0,0.06)",
        cursor: "grab",
      }}
    >
      <div
        className="h-0.5 bg-linear-to-r shadow-sm"
        style={{
          backgroundImage: `linear-gradient(90deg,${MERGE_COLOR},${MERGE_COLOR}90)`,
        }}
      />
      <div className="flex items-center gap-1.5 border-b border-gray-100 px-2.5 pt-2 pb-1.5">
        <div
          className="flex size-6 shrink-0 items-center justify-center rounded-md border text-current"
          style={{
            background: MERGE_BG,
            borderColor: `${MERGE_COLOR}30`,
            color: MERGE_COLOR,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M4 4v4h8V4M8 8v8"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <span
          className="min-w-0 flex-1 truncate text-xs font-bold"
          style={{ color: T.textPrimary }}
        >
          Merge
        </span>
      </div>
      <div className="px-2.5 py-2 text-[10px] leading-snug text-gray-500">
        {showHandles
          ? `Waits for ${handles.length} lane${handles.length === 1 ? "" : "s"}`
          : "Fan-in barrier"}
      </div>
      {showHandles
        ? handles.map((ch, index) => {
            const topPct = ((index + 1) / (handles.length + 1)) * 100
            return (
              <Handle
                key={ch.id}
                type="target"
                position={Position.Left}
                id={ch.id}
                className="size-2.5! border-2! border-white!"
                style={{
                  top: `${topPct}%`,
                  background: MERGE_COLOR,
                  boxShadow: `0 0 0 2px ${MERGE_COLOR}40`,
                }}
                title={ch.label}
              />
            )
          })
        : (
          <Handle
            type="target"
            position={Position.Left}
            className="size-3! border-2! bg-white!"
            style={{
              borderColor: MERGE_COLOR,
              boxShadow: `0 0 0 2px ${MERGE_COLOR}30`,
            }}
          />
        )}
      <Handle
        type="source"
        position={Position.Right}
        className="size-3! border-2! border-white!"
        style={{
          background: MERGE_COLOR,
          boxShadow: `0 0 0 3px ${MERGE_COLOR}30`,
        }}
      />
    </div>
  )
}
