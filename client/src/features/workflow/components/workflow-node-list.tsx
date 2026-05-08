import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { WorkflowNodeCard } from "./workflow-node-card"
import type { WorkflowNode } from "@/shared/types/workflow.type"

type WorkflowNodeListProps = {
  nodes: WorkflowNode[]
  onNodesChange: (nodes: WorkflowNode[]) => void
}

export function WorkflowNodeList({ nodes, onNodesChange }: WorkflowNodeListProps) {
  const sensors = useSensors(useSensor(PointerSensor))

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = nodes.findIndex((n) => n.nodeId === active.id)
    const newIndex = nodes.findIndex((n) => n.nodeId === over.id)

    // Prevent moving to index 0 (Text Generation is always first)
    if (newIndex === 0) return

    const reordered = arrayMove(nodes, oldIndex, newIndex).map((n, i) => ({
      ...n,
      order: i + 1,
    }))

    onNodesChange(reordered)
  }

  function handleRemove(nodeId: string) {
    const filtered = nodes
      .filter((n) => n.nodeId !== nodeId)
      .map((n, i) => ({ ...n, order: i + 1 }))
    onNodesChange(filtered)
  }

  function handlePromptChange(nodeId: string, value: string) {
    onNodesChange(nodes.map((n) => (n.nodeId === nodeId ? { ...n, userPrompt: value } : n)))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={nodes.map((n) => n.nodeId)} strategy={verticalListSortingStrategy}>
        <div className="space-y-3">
          {nodes.map((node) => (
            <WorkflowNodeCard
              key={node.nodeId}
              node={node}
              onRemove={handleRemove}
              onPromptChange={handlePromptChange}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
