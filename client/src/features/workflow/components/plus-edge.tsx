import { useState } from "react"
import { Plus } from "lucide-react"
import { useTranslation } from "react-i18next"
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from "@xyflow/react"

export type PlusEdgeData = {
  onInsert?: (event: React.MouseEvent, labelX: number, labelY: number) => void
  readOnly?: boolean
  paletteDropHighlight?: boolean
  paletteDropActive?: boolean
}

export function PlusEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  data,
}: EdgeProps) {
  const { t } = useTranslation("workflow")
  const [hovered, setHovered] = useState(false)
  const edgeData = data as PlusEdgeData | undefined
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const showButton =
    !edgeData?.readOnly &&
    (Boolean(edgeData?.onInsert) || Boolean(edgeData?.paletteDropHighlight))
  const forceVisible = Boolean(edgeData?.paletteDropHighlight)
  const isActive = Boolean(edgeData?.paletteDropActive)

  return (
    <>
      <g
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <BaseEdge
          id={id}
          path={edgePath}
          style={style}
          markerEnd={markerEnd}
        />
      </g>
      {showButton ? (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-all absolute"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
            }}
          >
            <button
              type="button"
              className={`flex size-6 items-center justify-center rounded-full border-2 border-card bg-[#00A589] text-white shadow-md transition-all duration-150 hover:bg-[#008f77] dark:border-[#252D3B] ${
                hovered || forceVisible ? "opacity-100" : "pointer-events-none opacity-0"
              } ${forceVisible && !hovered ? "pointer-events-none" : ""} ${
                forceVisible ? "ring-4 ring-[#00A589]/30" : ""
              } ${
                isActive ? "scale-110 shadow-[0_0_0_4px_rgba(0,165,137,0.35)]" : ""
              } ${forceVisible && !isActive ? "animate-pulse" : ""}`}
              onMouseEnter={() => setHovered(true)}
              onMouseLeave={() => setHovered(false)}
              onClick={(event) => {
                event.stopPropagation()
                edgeData?.onInsert?.(event, labelX, labelY)
              }}
              aria-label={t("aria.insertNode")}
            >
              <Plus size={14} strokeWidth={2.5} />
            </button>
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
}
