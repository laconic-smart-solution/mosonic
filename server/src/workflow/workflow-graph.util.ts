import { BadRequestException } from '@nestjs/common';
import { WorkflowNodeType } from '../nodes/schemas/workflow-node.schema';
import { resolveDistributionChannelId } from './distribution-channels.util';

export interface WorkflowGraphEdge {
  from: string;
  to: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export function buildLinearEdgesFromOrder(
  nodes: Array<{ nodeId: string; order: number }>,
): WorkflowGraphEdge[] {
  const sorted = [...nodes].sort((a, b) => a.order - b.order);
  const edges: WorkflowGraphEdge[] = [];
  for (let i = 0; i < sorted.length - 1; i += 1) {
    edges.push({ from: sorted[i].nodeId, to: sorted[i + 1].nodeId });
  }
  return edges;
}

export function getOutgoing(
  edges: WorkflowGraphEdge[],
  nodeId: string,
): WorkflowGraphEdge[] {
  return edges.filter((e) => e.from === nodeId);
}

export function getIncoming(
  edges: WorkflowGraphEdge[],
  nodeId: string,
): WorkflowGraphEdge[] {
  return edges.filter((e) => e.to === nodeId);
}

export function getRoots(
  nodeIds: string[],
  edges: WorkflowGraphEdge[],
): string[] {
  const hasIncoming = new Set(edges.map((e) => e.to));
  return nodeIds.filter((id) => !hasIncoming.has(id));
}

export function getDescendants(
  edges: WorkflowGraphEdge[],
  nodeId: string,
): Set<string> {
  const descendants = new Set<string>();
  const queue = getOutgoing(edges, nodeId).map((e) => e.to);
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (descendants.has(current)) {
      continue;
    }
    descendants.add(current);
    for (const edge of getOutgoing(edges, current)) {
      queue.push(edge.to);
    }
  }
  return descendants;
}

export function getAncestors(
  edges: WorkflowGraphEdge[],
  nodeId: string,
): Set<string> {
  const ancestors = new Set<string>();
  const queue = getIncoming(edges, nodeId).map((e) => e.from);
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (ancestors.has(current)) {
      continue;
    }
    ancestors.add(current);
    for (const edge of getIncoming(edges, current)) {
      queue.push(edge.from);
    }
  }
  return ancestors;
}

export function topologicalSort(
  nodeIds: string[],
  edges: WorkflowGraphEdge[],
): string[] {
  const indegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  for (const id of nodeIds) {
    indegree.set(id, 0);
    outgoing.set(id, []);
  }
  for (const edge of edges) {
    if (!indegree.has(edge.from) || !indegree.has(edge.to)) {
      continue;
    }
    outgoing.get(edge.from)!.push(edge.to);
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
  }

  const queue = nodeIds.filter((id) => (indegree.get(id) ?? 0) === 0);
  const sorted: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);
    for (const next of outgoing.get(current) ?? []) {
      const nextDegree = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, nextDegree);
      if (nextDegree === 0) {
        queue.push(next);
      }
    }
  }

  if (sorted.length < nodeIds.length) {
    const remainder = nodeIds.filter((id) => !sorted.includes(id));
    return [...sorted, ...remainder];
  }
  return sorted;
}

export function hasCycle(
  nodeIds: string[],
  edges: WorkflowGraphEdge[],
): boolean {
  const adj = new Map<string, string[]>();
  for (const id of nodeIds) {
    adj.set(id, []);
  }
  for (const edge of edges) {
    if (adj.has(edge.from) && adj.has(edge.to)) {
      adj.get(edge.from)!.push(edge.to);
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();

  function dfs(id: string): boolean {
    if (visiting.has(id)) {
      return true;
    }
    if (visited.has(id)) {
      return false;
    }
    visiting.add(id);
    for (const next of adj.get(id) ?? []) {
      if (dfs(next)) {
        return true;
      }
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  }

  for (const id of nodeIds) {
    if (dfs(id)) {
      return true;
    }
  }
  return false;
}

function assertWeaklyConnected(
  nodeIds: string[],
  edges: WorkflowGraphEdge[],
): void {
  if (edges.length === 0 || nodeIds.length <= 1) {
    return;
  }
  const adj = new Map<string, Set<string>>();
  for (const id of nodeIds) {
    adj.set(id, new Set());
  }
  for (const edge of edges) {
    adj.get(edge.from)!.add(edge.to);
    adj.get(edge.to)!.add(edge.from);
  }
  const visited = new Set<string>();
  const stack = [nodeIds[0]!];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (visited.has(id)) {
      continue;
    }
    visited.add(id);
    for (const next of adj.get(id) ?? []) {
      if (!visited.has(next)) {
        stack.push(next);
      }
    }
  }
  if (visited.size !== nodeIds.length) {
    throw new BadRequestException('Workflow graph has disconnected nodes');
  }
}

type NodeForValidation = {
  nodeId: string;
  type: WorkflowNodeType;
  order: number;
};

export function validateWorkflowGraph(
  nodes: NodeForValidation[],
  edges: WorkflowGraphEdge[],
): void {
  const nodeIds = new Set(nodes.map((n) => n.nodeId));
  if (nodes.length === 0) {
    throw new BadRequestException('nodes must not be empty');
  }

  for (const edge of edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      throw new BadRequestException(
        'Edge references unknown node; save nodes before edges',
      );
    }
    if (edge.from === edge.to) {
      throw new BadRequestException('Self-loop edges are not allowed');
    }
  }

  const seenPairs = new Set<string>();
  for (const edge of edges) {
    const key = `${edge.from}->${edge.to}`;
    if (seenPairs.has(key)) {
      throw new BadRequestException('Duplicate edges are not allowed');
    }
    seenPairs.add(key);
  }

  if (edges.length > 0 && hasCycle([...nodeIds], edges)) {
    throw new BadRequestException('Workflow graph contains a cycle');
  }

  const effectiveEdges =
    edges.length > 0 ? edges : buildLinearEdgesFromOrder(nodes);

  const hasBranch = nodes.some((n) => n.type === WorkflowNodeType.Branch);

  if (edges.length > 0) {
    assertWeaklyConnected([...nodeIds], edges);
  }

  if (hasBranch) {
    const branchNodes = nodes.filter((n) => n.type === WorkflowNodeType.Branch);
    const mergeNodes = nodes.filter((n) => n.type === WorkflowNodeType.Merge);
    if (branchNodes.length !== 1) {
      throw new BadRequestException(
        'Exactly one branch node is allowed per workflow',
      );
    }
    if (mergeNodes.length !== 1) {
      throw new BadRequestException(
        'A branch workflow requires exactly one merge node',
      );
    }
    const branchId = branchNodes[0]!.nodeId;
    const mergeId = mergeNodes[0]!.nodeId;
    const reachableFromBranch = new Set<string>([branchId]);
    let frontier = [branchId];
    let foundMerge = false;
    while (frontier.length > 0) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const edge of getOutgoing(effectiveEdges, id)) {
          if (edge.to === mergeId) {
            foundMerge = true;
          }
          if (!reachableFromBranch.has(edge.to)) {
            reachableFromBranch.add(edge.to);
            next.push(edge.to);
          }
        }
      }
      frontier = next;
    }
    if (!foundMerge) {
      throw new BadRequestException(
        'branch node must have a path to the merge node',
      );
    }
  }

  if (edges.length === 0 && nodes.length > 1) {
    assertWeaklyConnected(
      [...nodeIds],
      effectiveEdges,
    );
  }

  assertIntelligenceBeforeText(nodes, effectiveEdges);
}

function assertIntelligenceBeforeText(
  nodes: NodeForValidation[],
  edges: WorkflowGraphEdge[],
): void {
  const nodesById = new Map(nodes.map((n) => [n.nodeId, n]));
  const textNodes = nodes.filter(
    (n) => n.type === WorkflowNodeType.TextGeneration,
  );
  for (const textNode of textNodes) {
    const descendants = getDescendants(edges, textNode.nodeId);
    for (const descId of descendants) {
      const node = nodesById.get(descId);
      if (node?.type === WorkflowNodeType.Intelligence) {
        throw new BadRequestException(
          'intelligence must run before text_generation (cannot be downstream of text)',
        );
      }
    }
  }
}

export type PipelineNodeStatusLike = {
  nodeId: string;
  status: string;
};

export function areAllDependenciesMet(
  targetNodeId: string,
  pipelineNodes: PipelineNodeStatusLike[],
  edges: WorkflowGraphEdge[],
  terminalStatuses: Set<string>,
): boolean {
  const incoming = getIncoming(edges, targetNodeId);
  if (incoming.length === 0) {
    return true;
  }
  return incoming.every((edge) => {
    const dep = pipelineNodes.find((n) => n.nodeId === edge.from);
    return dep ? terminalStatuses.has(dep.status) : false;
  });
}

export function normalizeLaneId(channel: string): string {
  return resolveDistributionChannelId(channel);
}

export type PipelineNodeLaneLike = {
  nodeId: string;
  lane?: string | null;
};

/** Ancestors for context merge: shared trunk + same lane only. */
export function getAncestorsForLane(
  edges: WorkflowGraphEdge[],
  nodeId: string,
  nodeLane: string | null | undefined,
  nodesById: Map<string, PipelineNodeLaneLike>,
): Set<string> {
  const all = getAncestors(edges, nodeId);
  const lane = nodeLane?.trim() ? normalizeLaneId(nodeLane) : null;
  const filtered = new Set<string>();
  for (const ancestorId of all) {
    const ancestor = nodesById.get(ancestorId);
    const ancestorLane = ancestor?.lane?.trim()
      ? normalizeLaneId(ancestor.lane)
      : null;
    if (ancestorLane === null || ancestorLane === lane) {
      filtered.add(ancestorId);
    }
  }
  return filtered;
}

const SEMANTIC_PLANNER_TYPES = new Set<WorkflowNodeType>([
  WorkflowNodeType.Branch,
  WorkflowNodeType.Merge,
]);

export function isExecutableNodeType(type: WorkflowNodeType): boolean {
  return !SEMANTIC_PLANNER_TYPES.has(type);
}
