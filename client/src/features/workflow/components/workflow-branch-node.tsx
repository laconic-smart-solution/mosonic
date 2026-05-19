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

import { WorkflowNodeAddButton } from "./workflow-node-add-button"
import { WorkflowNodeDeleteButton } from "./workflow-node-delete-button"

const BRANCH_COLOR = "#0D9488"
const BRANCH_BG = "#CCFBF1"

export function WorkflowBranchNode({
  data,
  selected,
}: NodeProps<Node<WfNodeData, "branchNode">>) {
  const nodeId = useNodeId()
  const updateNodeInternals = useUpdateNodeInternals()
  const handles: BranchChannelHandle[] =
    (data.channelHandles as BranchChannelHandle[] | undefined) ?? []
  const sc = statusStyle(data.status)
  const showHandles = handles.length > 0
  const showAddButton = Boolean(data.onOpenAddPopover) && !data.readOnly

  useEffect(() => {
    if (nodeId) updateNodeInternals(nodeId)
  }, [handles.length, nodeId, showHandles, updateNodeInternals])

  return (
    <div
      className="group relative flex flex-col overflow-visible rounded-xl border-[1.5px] bg-white transition-[border-color,box-shadow] duration-150 select-none"
      style={{
        width: NODE_W,
        minHeight: 88,
        borderColor: selected ? BRANCH_COLOR : sc.border || T.surfaceBorder,
        boxShadow: selected
          ? `0 0 0 3px ${BRANCH_COLOR}20, 0 4px 20px ${BRANCH_COLOR}18`
          : "0 2px 8px rgba(0,0,0,0.06)",
        cursor: "grab",
      }}
    >
      <div
        className="h-0.5 bg-linear-to-r shadow-sm"
        style={{
          backgroundImage: `linear-gradient(90deg,${BRANCH_COLOR},${BRANCH_COLOR}90)`,
        }}
      />
      <Handle
        type="target"
        position={Position.Left}
        className="size-3! border-2! bg-white!"
        style={{
          borderColor: BRANCH_COLOR,
          boxShadow: `0 0 0 2px ${BRANCH_COLOR}20`,
        }}
      />
      <div className="flex items-center gap-1.5 border-b border-gray-100 px-2.5 pt-2 pb-1.5">
        <div
          className="flex size-6 shrink-0 items-center justify-center rounded-md border text-current"
          style={{
            background: BRANCH_BG,
            borderColor: `${BRANCH_COLOR}30`,
            color: BRANCH_COLOR,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M8 2v4M8 10v4M8 6h4M8 6H4"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <span
          className="min-w-0 flex-1 truncate text-xs font-bold"
          style={{ color: T.textPrimary }}
        >
          Branch
        </span>
      </div>
      <div className="px-2.5 py-2 text-[10px] leading-snug text-gray-500">
        {showHandles
          ? `${handles.length} channel lane${handles.length === 1 ? "" : "s"}`
          : "Fan-out by rule channels"}
      </div>
      {showHandles
        ? handles.map((ch, index) => {
            const topPct = ((index + 1) / (handles.length + 1)) * 100
            return (
              <Handle
                key={ch.id}
                type="source"
                position={Position.Right}
                id={ch.id}
                className="size-2.5! border-2! border-white!"
                style={{
                  top: `${topPct}%`,
                  background: BRANCH_COLOR,
                  boxShadow: `0 0 0 2px ${BRANCH_COLOR}30`,
                }}
                title={ch.label}
              />
            )
          })
        : (
          <Handle
            type="source"
            position={Position.Right}
            className="size-3! border-2! border-white!"
            style={{
              background: BRANCH_COLOR,
              boxShadow: `0 0 0 3px ${BRANCH_COLOR}30`,
            }}
          />
        )}
      <WorkflowNodeDeleteButton visible={Boolean(selected)} onDelete={data.onDelete} />
      <WorkflowNodeAddButton
        visible={showAddButton}
        onOpen={(event) => data.onOpenAddPopover?.(event, nodeId!)}
      />
    </div>
  )
}
