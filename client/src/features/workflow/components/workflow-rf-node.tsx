import { Handle, Position, type NodeProps } from "@xyflow/react"

import {
  NODE_W,
  WF_NODE_TYPES,
  canvasConfigSummary,
  statusStyle,
  type WfRfNode,
} from "@/features/workflow/data/workflow-model"
import { useFileObjectUrl } from "@/shared/hooks/use-file-object-url"
import { T } from "@/lib/tokens"

export function WorkflowRfNode({ data, selected }: NodeProps<WfRfNode>) {
  const nt =
    WF_NODE_TYPES.find((t) => t.type === data.wfType) ?? WF_NODE_TYPES[0]
  const sc = statusStyle(data.status)
  const isSel = selected
  const nonDeletable = data.wfType === "text" || data.wfType === "keywords"
  const previewImageSrc = useFileObjectUrl(data.previewImage)
  const previewVideoSrc = useFileObjectUrl(data.previewVideo)

  return (
    <div
      className="flex flex-col overflow-hidden rounded-xl border-[1.5px] bg-white transition-[border-color,box-shadow] duration-150 select-none"
      style={{
        width: NODE_W,
        // height: NODE_H,
        borderColor: isSel ? nt.color : T.surfaceBorder,
        boxShadow: isSel
          ? `0 0 0 3px ${nt.color}20, 0 4px 20px ${nt.color}18, 0 2px 6px rgba(0,0,0,0.06)`
          : "0 2px 8px rgba(0,0,0,0.06)",
        cursor: nonDeletable ? "grab" : data.locked ? "pointer" : "grab",
      }}
    >
      {data.wfType !== "keywords" ? (
        <Handle
          type="target"
          position={Position.Left}
          className="size-3! border-2! bg-white!"
          style={{
            borderColor: nt.color,
            boxShadow: `0 0 0 2px ${nt.color}20`,
          }}
        />
      ) : null}

      <div
        className="h-0.5 bg-linear-to-r shadow-sm"
        style={{
          backgroundImage: `linear-gradient(90deg,${nt.color},${nt.color}90)`,
        }}
      />
      <div className="flex items-center gap-1.5 border-b border-gray-100 px-2.5 pt-2 pb-1.5">
        <div
          className="flex size-6 shrink-0 items-center justify-center rounded-md border text-current"
          style={{
            background: nt.bg,
            borderColor: `${nt.color}30`,
            color: nt.color,
          }}
        >
          {nt.icon}
        </div>
        <span
          className="min-w-0 flex-1 truncate text-xs font-bold"
          style={{ color: T.textPrimary }}
        >
          {data.label}
        </span>
        {data.locked ? (
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden
          >
            <rect
              x="2"
              y="5"
              width="8"
              height="6"
              rx="1.5"
              stroke="#718096"
              strokeWidth="1.2"
            />
            <path
              d="M4 5V3.5a2 2 0 0 1 4 0V5"
              stroke="#718096"
              strokeWidth="1.2"
            />
          </svg>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 px-2.5 py-1.5">
        <div
          className="line-clamp-2 text-[11px] leading-snug"
          style={{ color: T.textSecondary }}
        >
          {canvasConfigSummary(data.wfType, data.config ?? {})}
        </div>
        {data.processingMessage ? (
          <div className="line-clamp-2 text-[10px] leading-snug text-[#2563EB]">
            {data.processingMessage}
          </div>
        ) : null}
        {data.errorMessage ? (
          <div className="line-clamp-2 text-[10px] leading-snug text-[#DC2626]">
            {data.errorMessage}
          </div>
        ) : null}
        {previewImageSrc ? (
          <img
            src={previewImageSrc}
            alt="Node output preview"
            className="w-full rounded object-cover"
          />
        ) : null}
        {previewVideoSrc ? (
          <video
            src={previewVideoSrc}
            className="h-10 w-full rounded object-cover"
            muted
            controls
          />
        ) : null}
        {data.previewText ? (
          <div className="line-clamp-3 rounded bg-gray-50 px-1.5 py-1 text-[10px] leading-snug text-gray-600">
            {data.previewText}
          </div>
        ) : null}
        <div className="flex items-center justify-between">
          <span
            className="inline-flex items-center gap-1 rounded-[20px] border px-1.5 py-0.5 text-[10px] font-semibold"
            style={{
              background: sc.bg,
              color: sc.text,
              borderColor: sc.border,
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
            <span className="text-[10px] text-[#EA580C]">
              {data.retryAttempt}/{data.retryMaxAttempts}
            </span>
          ) : null}
          {data.status === "failed_final" ? (
            <button
              type="button"
              onClick={() => data.onRetry?.()}
              className="rounded border border-[#DC2626] bg-[#FEE2E2] px-1.5 py-0.5 text-[10px] text-[#DC2626]"
            >
              Retry
            </button>
          ) : null}
          {isSel ? (
            <div className="flex gap-0.5">
              {!nonDeletable ? (
                <>
                  <button
                    type="button"
                    title="Drag to reorder"
                    className="flex size-[22px] cursor-pointer items-center justify-center rounded-[5px] border bg-gray-100 text-[11px]"
                    style={{ borderColor: T.surfaceBorder, color: T.textSecondary }}
                  >
                    ::
                  </button>
                  <button
                    type="button"
                    onClick={() => data.onDelete?.()}
                    className="flex size-[22px] cursor-pointer items-center justify-center rounded-[5px] border border-[#FCA5A5] bg-[#FEE2E2] text-[11px] text-[#DC2626]"
                  >
                    ✕
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  title="Drag to reorder"
                  className="flex size-[22px] cursor-pointer items-center justify-center rounded-[5px] border bg-gray-100 text-[11px]"
                  style={{ borderColor: T.surfaceBorder, color: T.textSecondary }}
                >
                  ::
                </button>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="size-3! border-2! border-white!"
        style={{
          background: nt.color,
          boxShadow: `0 0 0 3px ${nt.color}30, 0 2px 4px ${nt.color}40`,
        }}
      />
    </div>
  )
}
