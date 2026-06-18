import { randomUUID } from 'node:crypto';
import { WorkflowNodeType } from '../nodes/schemas/workflow-node.schema';
import {
  LANE_NODE_ORDER,
} from './workflow-node-next-matrix';
import { normalizeLaneId } from './workflow-graph.util';

export type GraphNodeSpec = {
  nodeId: string;
  type: WorkflowNodeType;
  order: number;
  isLocked: boolean;
  config: Record<string, unknown>;
  userPrompt?: string;
  lane?: string | null;
};

const LANE_TEMPLATE_TYPES = new Set<WorkflowNodeType>([
  WorkflowNodeType.Adapt,
  WorkflowNodeType.ImageGeneration,
  WorkflowNodeType.VideoGeneration,
  WorkflowNodeType.Summarization,
  WorkflowNodeType.Translation,
]);

function readLaneId(node: GraphNodeSpec): string {
  const fromLane = node.lane?.trim();
  if (fromLane) return normalizeLaneId(fromLane);
  const fromConfig = (node.config as { laneId?: string }).laneId?.trim();
  return fromConfig ? normalizeLaneId(fromConfig) : '';
}

function hasLaneAssigned(node: GraphNodeSpec): boolean {
  return readLaneId(node).length > 0;
}

function laneTypePriority(type: WorkflowNodeType): number {
  if (type === WorkflowNodeType.Adapt) return -1;
  const idx = (LANE_NODE_ORDER as readonly string[]).indexOf(type);
  return idx === -1 ? 99 : idx;
}

function isGraphWorkflow(nodes: GraphNodeSpec[]): boolean {
  return (
    nodes.some((n) => n.type === WorkflowNodeType.Branch) &&
    nodes.some((n) => n.type === WorkflowNodeType.Merge)
  );
}

/**
 * Expands unassigned lane templates (between branch and merge) into one node per channel.
 */
export function expandGraphLaneTemplates(
  nodes: GraphNodeSpec[],
  channelIds: string[],
): GraphNodeSpec[] {
  if (!isGraphWorkflow(nodes) || channelIds.length < 2) {
    return nodes;
  }

  const lanes = [...new Set(channelIds.map((c) => normalizeLaneId(c)))].filter(
    Boolean,
  );
  if (lanes.length < 2) {
    return nodes;
  }

  const branch = nodes.find((n) => n.type === WorkflowNodeType.Branch);
  const merge = nodes.find((n) => n.type === WorkflowNodeType.Merge);
  if (!branch || !merge) {
    return nodes;
  }

  const branchOrder = branch.order;
  const mergeOrder = merge.order;

  const laneTemplates = nodes
    .filter(
      (n) =>
        n.order > branchOrder &&
        n.order < mergeOrder &&
        LANE_TEMPLATE_TYPES.has(n.type) &&
        !hasLaneAssigned(n),
    )
    .sort((a, b) => laneTypePriority(a.type) - laneTypePriority(b.type));

  if (laneTemplates.length === 0) {
    return nodes;
  }

  const templateIds = new Set(laneTemplates.map((n) => n.nodeId));
  const trunkNodes = nodes.filter((n) => !templateIds.has(n.nodeId));

  const expandedLane: GraphNodeSpec[] = [];
  for (const lane of lanes) {
    for (const template of laneTemplates) {
      expandedLane.push({
        nodeId: randomUUID(),
        type: template.type,
        order: 0,
        isLocked: template.isLocked,
        config: {
          ...template.config,
          laneId: lane,
        },
        userPrompt: template.userPrompt,
        lane,
      });
    }
  }

  const mergeNode = trunkNodes.find((n) => n.type === WorkflowNodeType.Merge);
  const withoutMerge = trunkNodes.filter(
    (n) => n.type !== WorkflowNodeType.Merge,
  );

  const combined = [...withoutMerge, ...expandedLane, ...(mergeNode ? [mergeNode] : [])];
  return combined.map((n, idx) => ({ ...n, order: idx + 1 }));
}

export function assignNodeIds(
  nodes: Array<{
    type: WorkflowNodeType;
    order: number;
    isLocked: boolean;
    config: Record<string, unknown>;
    userPrompt?: string;
    lane?: string | null;
  }>,
): GraphNodeSpec[] {
  return nodes.map((n) => ({
    ...n,
    nodeId: randomUUID(),
    userPrompt: n.userPrompt ?? '',
    lane: n.lane ?? null,
  }));
}
