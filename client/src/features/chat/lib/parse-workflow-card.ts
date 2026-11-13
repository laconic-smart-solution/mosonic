export type WorkflowCardNode = {
  nodeId: string
  type: string
  order: number
  lane: string | null
  isLocked: boolean
}

export type WorkflowCardSnapshot = {
  action: "show_workflow"
  workflowId: string
  ruleId: string
  status: string
  name: string
  /** Brand the workflow belongs to - the card title is "<brand> · Workflow". */
  brandName?: string
  nodes: WorkflowCardNode[]
}

function parseNode(value: unknown): WorkflowCardNode | null {
  if (!value || typeof value !== "object") return null
  const node = value as Record<string, unknown>
  if (typeof node.nodeId !== "string" || typeof node.type !== "string") return null
  if (typeof node.order !== "number") return null
  return {
    nodeId: node.nodeId,
    type: node.type,
    order: node.order,
    lane: typeof node.lane === "string" && node.lane.trim() ? node.lane.trim() : null,
    isLocked: node.isLocked === true,
  }
}

export function parseWorkflowCard(result: string): WorkflowCardSnapshot | null {
  try {
    const parsed: unknown = JSON.parse(result)
    if (!parsed || typeof parsed !== "object") return null
    const obj = parsed as Record<string, unknown>
    if (obj.ok !== true || obj.action !== "show_workflow") return null
    if (typeof obj.workflowId !== "string" || !obj.workflowId.trim()) return null
    if (typeof obj.ruleId !== "string" || !obj.ruleId.trim()) return null
    const nodes: WorkflowCardNode[] = []
    if (Array.isArray(obj.nodes)) {
      for (const item of obj.nodes) {
        const node = parseNode(item)
        if (node) nodes.push(node)
      }
    }
    nodes.sort((a, b) => a.order - b.order)
    return {
      action: "show_workflow",
      workflowId: obj.workflowId,
      ruleId: obj.ruleId,
      status: typeof obj.status === "string" ? obj.status : "generating",
      name: typeof obj.name === "string" ? obj.name : "",
      brandName: typeof obj.brandName === "string" ? obj.brandName : "",
      nodes,
    }
  } catch {
    return null
  }
}

export function findWorkflowCards(
  steps: { type: string; result?: string }[] | null,
): WorkflowCardSnapshot[] {
  if (!steps) return []
  const byId = new Map<string, WorkflowCardSnapshot>()
  for (const step of steps) {
    if (step.type !== "observation" && step.type !== "tool_call") continue
    if (typeof step.result !== "string") continue
    const card = parseWorkflowCard(step.result)
    if (card) byId.set(card.workflowId, card)
  }
  return [...byId.values()]
}

const LEGACY_NAME = /^workflow for rule\s/i
const UNTITLED_PATTERN = /^untitled(\s+(brand|workflow))?$/i

/** Never show an internal id or "Untitled · Workflow": brand name first, then fallback. */
export function workflowCardTitle(snapshot: Pick<WorkflowCardSnapshot, "name" | "brandName">, fallback: string): string {
  const brand = snapshot.brandName?.trim()
  if (brand && !UNTITLED_PATTERN.test(brand)) return `${brand} · ${fallback}`
  const name = snapshot.name.trim()
  return name && !LEGACY_NAME.test(name) && !UNTITLED_PATTERN.test(name) ? name : fallback
}
