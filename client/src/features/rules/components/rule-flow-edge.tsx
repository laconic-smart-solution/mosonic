import {
  BaseEdge,
  getBezierPath,
  Position,
  type ConnectionLineComponentProps,
  type EdgeProps,
} from "@xyflow/react"
import { useRuleFlowVisualTheme } from "@/features/rules/lib/rule-flow-theme"

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
  const flowTheme = useRuleFlowVisualTheme()
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
      stroke={flowTheme.connectionLineColor}
      strokeWidth={flowTheme.edgeWidth}
      strokeDasharray="6 4"
      opacity={flowTheme.edgeOpacity + 0.2}
    />
  )
}

export const ruleFlowEdgeTypes = { floating: FloatingEdge }
