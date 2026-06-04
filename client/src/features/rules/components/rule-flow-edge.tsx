import {
  BaseEdge,
  getBezierPath,
  Position,
  type ConnectionLineComponentProps,
  type EdgeProps,
} from "@xyflow/react"

export function FloatingEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
}: EdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.28,
  })

  return <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />
}

export function FloatingConnectionLine({
  fromX,
  fromY,
  fromPosition,
  toX,
  toY,
  toPosition,
}: ConnectionLineComponentProps) {
  const [edgePath] = getBezierPath({
    sourceX: fromX,
    sourceY: fromY,
    sourcePosition: fromPosition ?? Position.Bottom,
    targetX: toX,
    targetY: toY,
    targetPosition: toPosition ?? Position.Top,
    curvature: 0.28,
  })

  return (
    <path
      d={edgePath}
      fill="none"
      stroke="#7E8BA0"
      strokeWidth={1.6}
      strokeDasharray="6 4"
      opacity={0.9}
    />
  )
}

export const ruleFlowEdgeTypes = { floating: FloatingEdge }
