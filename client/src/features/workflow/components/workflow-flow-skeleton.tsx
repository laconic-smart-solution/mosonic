import { Background, Controls, ReactFlow, type Edge, type Node } from "@xyflow/react"

type SkeletonNodeData = { label: string }

const nodes: Node<SkeletonNodeData>[] = [
  {
    id: "s1",
    position: { x: 100, y: 140 },
    data: { label: "Text Generation" },
    draggable: false,
  },
  {
    id: "s2",
    position: { x: 420, y: 140 },
    data: { label: "Image Generation" },
    draggable: false,
  },
  {
    id: "s3",
    position: { x: 740, y: 140 },
    data: { label: "Translation" },
    draggable: false,
  },
]

const edges: Edge[] = [
  { id: "e-s1-s2", source: "s1", target: "s2", animated: true, style: { stroke: "#CBD5E1", strokeWidth: 2 } },
  { id: "e-s2-s3", source: "s2", target: "s3", animated: true, style: { stroke: "#CBD5E1", strokeWidth: 2 } },
]

function SkeletonNode({ data }: { data: SkeletonNodeData }) {
  return (
    <div className="w-[240px] rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 h-2.5 w-24 animate-pulse rounded bg-slate-200" />
      <div className="mb-2 h-2 w-full animate-pulse rounded bg-slate-100" />
      <div className="h-2 w-5/6 animate-pulse rounded bg-slate-100" />
      <p className="mt-3 text-[10px] text-slate-400">{data.label}</p>
    </div>
  )
}

const nodeTypes = { skeletonNode: SkeletonNode }

export function WorkflowFlowSkeleton() {
  return (
    <div className="h-full w-full">
      <ReactFlow nodes={nodes.map((n) => ({ ...n, type: "skeletonNode" }))} edges={edges} nodeTypes={nodeTypes} fitView nodesDraggable={false} nodesConnectable={false} elementsSelectable={false}>
        <Background gap={24} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}
