import type { WorkflowNode, WorkflowNodeType } from "@/shared/types/workflow.type"
import { channelLabel } from "@/shared/constants/distribution-channels"
import {
  backendTypeToCanvas,
  getWfNodeTypeLabel,
} from "@/features/workflow/data/workflow-model"

const REVIEWABLE_NODE_TYPES = new Set<WorkflowNodeType>([
  "keyword_planner",
  "text_generation",
  "image_generation",
  "video_generation",
  "translation",
  "transcription",
  "summarization",
  "adapt",
  "intelligence",
])

export type ReviewableWorkflowNode = {
  nodeId: string
  label: string
  type: WorkflowNodeType
}

export function isReviewableWorkflowNodeType(type: WorkflowNodeType): boolean {
  return REVIEWABLE_NODE_TYPES.has(type)
}

function formatReviewableNodeLabel(node: WorkflowNode): string {
  const base = getWfNodeTypeLabel(backendTypeToCanvas(node.type))
  const lane = node.lane?.trim()
  if (lane) {
    return `${base} (${channelLabel(lane)})`
  }
  return base
}

export function listReviewableWorkflowNodes(
  nodes: WorkflowNode[],
): ReviewableWorkflowNode[] {
  return nodes
    .filter((node) => isReviewableWorkflowNodeType(node.type))
    .sort((a, b) => a.order - b.order)
    .map((node) => ({
      nodeId: node.nodeId,
      type: node.type,
      label: formatReviewableNodeLabel(node),
    }))
}
