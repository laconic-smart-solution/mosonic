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

  const showButton = !edgeData?.readOnly && Boolean(edgeData?.onInsert)

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
              className={`flex size-6 items-center justify-center rounded-full border-2 border-white bg-[#00A589] text-white shadow-md transition-opacity duration-150 hover:bg-[#008f77] ${
                hovered ? "opacity-100" : "pointer-events-none opacity-0"
              }`}
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
