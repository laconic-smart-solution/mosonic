import type { WorkflowNode } from "@/shared/types/workflow.type"

/** True when the workflow includes an Intelligence (web search) node. */
export function workflowHasIntelligenceNode(nodes: WorkflowNode[]): boolean {
  return nodes.some((node) => node.type === "intelligence")
}
