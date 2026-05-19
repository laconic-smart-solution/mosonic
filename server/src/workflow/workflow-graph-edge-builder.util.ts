import { BadRequestException } from '@nestjs/common';
import { WorkflowNodeType } from '../nodes/schemas/workflow-node.schema';
import {
  LANE_NODE_ORDER,
  WORKFLOW_NEXT_MATRIX,
} from './workflow-node-next-matrix';
import {
  buildLinearEdgesFromOrder,
  normalizeLaneId,
  type WorkflowGraphEdge,
} from './workflow-graph.util';
import type { GraphNodeSpec } from './workflow-graph-expand.util';

function readLaneId(node: GraphNodeSpec): string {
  const fromLane = node.lane?.trim();
  if (fromLane) return normalizeLaneId(fromLane);
  const fromConfig = (node.config as { laneId?: string }).laneId?.trim();
  return fromConfig ? normalizeLaneId(fromConfig) : '';
}

function laneTypePriority(type: WorkflowNodeType): number {
  if (type === WorkflowNodeType.Adapt) return -1;
  const idx = (LANE_NODE_ORDER as readonly string[]).indexOf(type);
  return idx === -1 ? 99 : idx;
}

function assertMatrixAllows(
  fromType: WorkflowNodeType,
  toType: WorkflowNodeType,
): void {
  const allowed =
    WORKFLOW_NEXT_MATRIX[fromType as keyof typeof WORKFLOW_NEXT_MATRIX];
  if (!allowed || !(allowed as readonly string[]).includes(toType)) {
    throw new BadRequestException(
      `Invalid workflow edge: ${fromType} cannot connect to ${toType}`,
    );
  }
}

export function assertEdgesRespectMatrix(
  nodes: Array<{ nodeId: string; type: WorkflowNodeType }>,
  edges: WorkflowGraphEdge[],
): void {
  const byId = new Map(nodes.map((n) => [n.nodeId, n]));
  for (const edge of edges) {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) continue;
    assertMatrixAllows(from.type, to.type);
  }
}

function isGraphWorkflow(nodes: GraphNodeSpec[]): boolean {
  return (
    nodes.some((n) => n.type === WorkflowNodeType.Branch) &&
    nodes.some((n) => n.type === WorkflowNodeType.Merge)
  );
}

function buildLinearWorkflowEdges(nodes: GraphNodeSpec[]): WorkflowGraphEdge[] {
  const sorted = [...nodes].sort((a, b) => a.order - b.order);
  const edges: WorkflowGraphEdge[] = [];
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const from = sorted[i]!;
    const to = sorted[i + 1]!;
    assertMatrixAllows(from.type, to.type);
    edges.push({ from: from.nodeId, to: to.nodeId });
  }
  return edges;
}

function buildGraphWorkflowEdges(nodes: GraphNodeSpec[]): WorkflowGraphEdge[] {
  const branch = nodes.find((n) => n.type === WorkflowNodeType.Branch);
  const merge = nodes.find((n) => n.type === WorkflowNodeType.Merge);
  if (!branch || !merge) {
    return buildLinearWorkflowEdges(nodes);
  }

  const edges: WorkflowGraphEdge[] = [];

  const trunkNodes = nodes
    .filter((n) => !readLaneId(n) && n.nodeId !== merge.nodeId)
    .sort((a, b) => a.order - b.order);

  for (let i = 0; i < trunkNodes.length - 1; i += 1) {
    const from = trunkNodes[i]!;
    const to = trunkNodes[i + 1]!;
    assertMatrixAllows(from.type, to.type);
    edges.push({ from: from.nodeId, to: to.nodeId });
  }

  const laneIds = [
    ...new Set(nodes.map(readLaneId).filter((lane) => lane.length > 0)),
  ];

  for (const lane of laneIds) {
    const laneNodes = nodes
      .filter((n) => readLaneId(n) === lane)
      .sort((a, b) => laneTypePriority(a.type) - laneTypePriority(b.type));

    if (laneNodes.length === 0) continue;

    const first = laneNodes[0]!;
    assertMatrixAllows(branch.type, first.type);
    edges.push({
      from: branch.nodeId,
      to: first.nodeId,
      sourceHandle: lane,
    });

    for (let i = 0; i < laneNodes.length - 1; i += 1) {
      const from = laneNodes[i]!;
      const to = laneNodes[i + 1]!;
      assertMatrixAllows(from.type, to.type);
      edges.push({ from: from.nodeId, to: to.nodeId });
    }

    const last = laneNodes[laneNodes.length - 1]!;
    assertMatrixAllows(last.type, merge.type);
    edges.push({
      from: last.nodeId,
      to: merge.nodeId,
      targetHandle: lane,
    });
  }

  return edges;
}

/**
 * Builds matrix-valid directed edges for a workflow graph node list.
 */
export function buildWorkflowEdges(nodes: GraphNodeSpec[]): WorkflowGraphEdge[] {
  if (nodes.length <= 1) {
    return [];
  }
  if (isGraphWorkflow(nodes)) {
    return buildGraphWorkflowEdges(nodes);
  }
  return buildLinearWorkflowEdges(nodes);
}

export { buildLinearEdgesFromOrder };
