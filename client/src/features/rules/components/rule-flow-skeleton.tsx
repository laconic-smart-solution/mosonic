import "@xyflow/react/dist/style.css"

import { Background, Controls, ReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react"
import { Skeleton } from "@/components/ui/skeleton"

type SkeletonNodeData = { width: number; height: number }

function SkeletonBubbleNode({ data }: NodeProps<Node<SkeletonNodeData>>) {
  return (
    <div className="pointer-events-none" style={{ width: data.width, height: data.height }}>
      <Skeleton className="h-full w-full rounded-xl shadow-sm" />
    </div>
  )
}

const skeletonNodeTypes = { skeletonBubble: SkeletonBubbleNode }

/** Hub-and-spoke layout approximating the rule flow structure (static, non-interactive). */
function buildSkeletonFlow(): { nodes: Node<SkeletonNodeData>[]; edges: Edge[] } {
  const center = { x: 0, y: 0 }
  const ring = 280
  const count = 6
  const nodes: Node<SkeletonNodeData>[] = [
    {
      id: "sk-root",
      type: "skeletonBubble",
      position: center,
      data: { width: 140, height: 52 },
    },
  ]
  const edges: Edge[] = []
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI / 2 + (i * (Math.PI * 2)) / count
    const x = center.x + Math.cos(angle) * ring - 70
    const y = center.y + Math.sin(angle) * ring - 22
    const id = `sk-branch-${i}`
    nodes.push({
      id,
      type: "skeletonBubble",
      position: { x, y },
      data: { width: 120, height: 40 },
    })
    edges.push({
      id: `sk-e-${id}`,
      source: "sk-root",
      target: id,
      type: "smoothstep",
      style: { stroke: "#C5CCD6", strokeWidth: 1.2, strokeOpacity: 0.7 },
      animated: false,
    })
  }
  return { nodes, edges }
}

const { nodes: skeletonNodes, edges: skeletonEdges } = buildSkeletonFlow()

export function RuleFlowSkeleton() {
  return (
    <ReactFlow
      nodes={skeletonNodes}
      edges={skeletonEdges}
      nodeTypes={skeletonNodeTypes}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      panOnDrag
      zoomOnScroll
      edgesFocusable={false}
      className="h-full min-h-0 w-full flex-1 bg-muted/10"
    >
      <Background gap={18} size={1} />
      <Controls showInteractive={false} />
    </ReactFlow>
  )
}
