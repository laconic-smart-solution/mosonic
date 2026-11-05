export type PipelineCardNode = {
  type: string
  order: number
  status: string
  retryCount: number
}

export type PipelineCardSnapshot = {
  action: "pipeline_started" | "pipeline_status"
  pipelineId: string
  workflowId: string
  status: string
  pausedNodeId: string | null
  contentPrompt: string
  counts: Record<string, number>
  nodes: PipelineCardNode[]
}

function parsePipelineNode(value: unknown): PipelineCardNode | null {
  if (!value || typeof value !== "object") return null
  const node = value as Record<string, unknown>
  if (typeof node.type !== "string" || typeof node.status !== "string") return null
  if (typeof node.order !== "number") return null
  return {
    type: node.type,
    order: node.order,
    status: node.status,
    retryCount: typeof node.retryCount === "number" ? node.retryCount : 0,
  }
}

export function parsePipelineCard(result: string): PipelineCardSnapshot | null {
  try {
    const parsed: unknown = JSON.parse(result)
    if (!parsed || typeof parsed !== "object") return null
    const obj = parsed as Record<string, unknown>
    if (obj.ok !== true) return null
    if (obj.action !== "pipeline_started" && obj.action !== "pipeline_status") return null
    if (typeof obj.pipelineId !== "string" || !obj.pipelineId.trim()) return null
    const nodes: PipelineCardNode[] = []
    if (Array.isArray(obj.nodes)) {
      for (const item of obj.nodes) {
        const node = parsePipelineNode(item)
        if (node) nodes.push(node)
      }
    }
    nodes.sort((a, b) => a.order - b.order)
    const counts: Record<string, number> = {}
    if (obj.counts && typeof obj.counts === "object" && !Array.isArray(obj.counts)) {
      for (const [key, value] of Object.entries(obj.counts)) {
        if (typeof value === "number") counts[key] = value
      }
    }
    return {
      action: obj.action,
      pipelineId: obj.pipelineId,
      workflowId: typeof obj.workflowId === "string" ? obj.workflowId : "",
      status: typeof obj.status === "string" ? obj.status : "running",
      pausedNodeId: typeof obj.pausedNodeId === "string" ? obj.pausedNodeId : null,
      contentPrompt: typeof obj.contentPrompt === "string" ? obj.contentPrompt : "",
      counts,
      nodes,
    }
  } catch {
    return null
  }
}

export function findPipelineCards(
  steps: { type: string; result?: string }[] | null,
): PipelineCardSnapshot[] {
  if (!steps) return []
  const byId = new Map<string, PipelineCardSnapshot>()
  for (const step of steps) {
    if (step.type !== "observation" && step.type !== "tool_call") continue
    if (typeof step.result !== "string") continue
    const card = parsePipelineCard(step.result)
    if (card) byId.set(card.pipelineId, card)
  }
  return [...byId.values()]
}
