import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WorkflowNodeType } from '../nodes/schemas/workflow-node.schema';
import type { Rule } from '../rule/schemas/rule.schema';
import type { ChannelEntry } from '../rule/schemas/rule.schema';
import {
  channelIdsToChannelEntries,
  ruleChannelNamesToIds,
} from '../workflow/distribution-channels.util';
import {
  buildLinearEdgesFromOrder,
  getIncoming,
  getOutgoing,
  normalizeLaneId,
  topologicalSort,
  type WorkflowGraphEdge,
} from '../workflow/workflow-graph.util';

export type WorkflowNodeTemplate = {
  nodeId: string;
  type: WorkflowNodeType;
  order: number;
  isLocked: boolean;
  userPrompt?: string;
  config: Record<string, unknown>;
};

/** Merge authoring `WorkflowNode.lane` into config when `laneId` is missing (legacy rows). */
export function mergeWorkflowLaneIntoConfig(
  config: Record<string, unknown>,
  lane: string | null | undefined,
): Record<string, unknown> {
  const next = { ...config };
  const top = lane?.trim();
  const existing = typeof next.laneId === 'string' ? next.laneId.trim() : '';
  if (top && !existing) {
    next.laneId = top;
  }
  return next;
}

export type MaterializedPipelineNode = {
  nodeId: string;
  type: WorkflowNodeType;
  order: number;
  isLocked: boolean;
  userPrompt: string;
  config: Record<string, unknown>;
  lane: string | null;
  variantId: string | null;
};

export type MaterializedPipeline = {
  nodes: MaterializedPipelineNode[];
  edges: WorkflowGraphEdge[];
  lanes: string[];
};

type BranchConfig = {
  mode?: 'rule_channels' | 'wizard_channels' | 'ab_test';
  channels?: string[];
  variants?: Array<{ id: string; weight: number; channel?: string }>;
};

type AbVariantTarget = {
  channel: ChannelEntry;
  variantId: string;
};

const SHARED_LANE_TEMPLATE_TYPES = new Set<WorkflowNodeType>([
  WorkflowNodeType.Adapt,
  WorkflowNodeType.ImageGeneration,
  WorkflowNodeType.VideoGeneration,
  WorkflowNodeType.Summarization,
  WorkflowNodeType.Translation,
]);

export type LaneMaterializationContext = {
  adaptTemplateCount: number;
  /** Unassigned lane templates in the branch subgraph, keyed by type. */
  singletonLaneTemplateCounts: Partial<Record<WorkflowNodeType, number>>;
};

const LAYOUT_NODE_W = 220;
const LAYOUT_PIPE_GAP = 48;
const LAYOUT_LANE_GAP = 140;
const LAYOUT_CENTER_Y = 140;

function layoutLaneOffsetY(laneIndex: number, laneCount: number): number {
  return LAYOUT_CENTER_Y + (laneIndex - (laneCount - 1) / 2) * LAYOUT_LANE_GAP;
}

/** Map materialized node ids to canvas positions (template coords + per-lane offsets). */
export function buildPipelineNodeLayoutMap(
  materializedNodes: readonly { nodeId: string; lane?: string | null }[],
  templatePositions: ReadonlyMap<string, { x: number; y: number }>,
): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = {};
  const lanes = [
    ...new Set(
      materializedNodes
        .map((n) => n.lane?.trim())
        .filter((lane): lane is string => Boolean(lane)),
    ),
  ];
  const laneIndexByKey = new Map(
    lanes.map((lane, index) => [lane.toLowerCase(), index]),
  );

  for (const m of materializedNodes) {
    const idx = m.nodeId.lastIndexOf('__');
    const base = idx >= 0 ? m.nodeId.slice(0, idx) : m.nodeId;
    const p = templatePositions.get(base);
    if (
      !p ||
      typeof p.x !== 'number' ||
      !Number.isFinite(p.x) ||
      typeof p.y !== 'number' ||
      !Number.isFinite(p.y)
    ) {
      continue;
    }
    const lane = m.lane?.trim();
    if (lane && idx >= 0 && lanes.length > 0) {
      const laneIndex = laneIndexByKey.get(lane.toLowerCase()) ?? 0;
      out[m.nodeId] = {
        x: p.x,
        y: layoutLaneOffsetY(laneIndex, lanes.length),
      };
    } else {
      out[m.nodeId] = { x: p.x, y: p.y };
    }
  }
  return out;
}

/** Whether a branch-subgraph template should materialize on the given lane. */
export function templateMatchesLane(
  template: WorkflowNodeTemplate,
  lane: string,
  ctx: LaneMaterializationContext,
): boolean {
  const laneId = (template.config as { laneId?: string }).laneId?.trim();
  if (!laneId && SHARED_LANE_TEMPLATE_TYPES.has(template.type)) {
    const singletonCount =
      template.type === WorkflowNodeType.Adapt
        ? ctx.adaptTemplateCount
        : (ctx.singletonLaneTemplateCounts[template.type] ?? 0);
    if (singletonCount === 1) {
      return true;
    }
  }
  if (!laneId) {
    return false;
  }
  return normalizeLaneId(laneId) === lane;
}

@Injectable()
export class GraphMaterializationService {
  private readonly maxLanes: number;

  constructor(config: ConfigService) {
    this.maxLanes = Number(config.get('MAX_MATERIALIZED_LANES', 10));
  }

  materialize(
    templateNodes: WorkflowNodeTemplate[],
    templateEdges: WorkflowGraphEdge[],
    rule: Rule,
    workflowVersion: number,
  ): MaterializedPipeline {
    const branchNode = templateNodes.find(
      (n) => n.type === WorkflowNodeType.Branch,
    );
    if (!branchNode) {
      return this.withoutMaterialization(templateNodes, templateEdges);
    }

    const mergeNode = templateNodes.find(
      (n) => n.type === WorkflowNodeType.Merge,
    );
    if (!mergeNode) {
      throw new BadRequestException(
        'Branch workflows require a merge node downstream',
      );
    }

    const effectiveEdges =
      templateEdges.length > 0
        ? templateEdges
        : buildLinearEdgesFromOrder(templateNodes);

    const subgraphIds = this.collectSubgraphNodeIds(
      effectiveEdges,
      branchNode.nodeId,
      mergeNode.nodeId,
    );
    const trunkNodes = templateNodes.filter(
      (n) =>
        n.nodeId !== branchNode.nodeId &&
        n.nodeId !== mergeNode.nodeId &&
        !subgraphIds.has(n.nodeId),
    );

    const branchConfig = branchNode.config as BranchConfig;
    const abTargets = this.resolveAbTargets(branchConfig, rule.channels ?? []);
    const channels = abTargets.map((t) => t.channel);
    if (channels.length < 1) {
      throw new BadRequestException(
        'Branch node requires at least one selected channel',
      );
    }
    if (channels.length > this.maxLanes) {
      throw new BadRequestException(
        `Too many channels to materialize (max ${this.maxLanes})`,
      );
    }

    const subgraphTemplates = templateNodes.filter((n) =>
      subgraphIds.has(n.nodeId),
    );
    const adaptTemplateCount = subgraphTemplates.filter(
      (n) => n.type === WorkflowNodeType.Adapt,
    ).length;
    const singletonLaneTemplateCounts: Partial<
      Record<WorkflowNodeType, number>
    > = {};
    for (const template of subgraphTemplates) {
      if (!SHARED_LANE_TEMPLATE_TYPES.has(template.type)) continue;
      const assigned = (template.config as { laneId?: string }).laneId?.trim();
      if (assigned) continue;
      singletonLaneTemplateCounts[template.type] =
        (singletonLaneTemplateCounts[template.type] ?? 0) + 1;
    }
    const branchIncoming = getIncoming(effectiveEdges, branchNode.nodeId);
    const mergeOutgoing = getOutgoing(effectiveEdges, mergeNode.nodeId);

    const materializedNodes: MaterializedPipelineNode[] = trunkNodes.map((n) =>
      this.toPipelineNode(n, null),
    );

    const lanes: string[] = [];
    const laneEntryIds: string[] = [];
    const laneExitIds: string[] = [];

    for (const target of abTargets) {
      const channel = target.channel;
      const lane = normalizeLaneId(channel.channel);
      lanes.push(lane);
      const laneCtx: LaneMaterializationContext = {
        adaptTemplateCount,
        singletonLaneTemplateCounts,
      };
      const laneTemplates = subgraphTemplates.filter((template) =>
        templateMatchesLane(template, lane, laneCtx),
      );
      const laneNodes = laneTemplates.map((template, index) => {
        const clonedId = `${template.nodeId}__${lane}`;
        const config = { ...template.config };
        if (
          template.type === WorkflowNodeType.Adapt ||
          template.type === WorkflowNodeType.ImageGeneration
        ) {
          config.channel = channel.channel;
        }
        if (template.type === WorkflowNodeType.Adapt) {
          config.contentStyle = channel.contentStyle;
        }
        return this.toPipelineNode(
          {
            ...template,
            nodeId: clonedId,
            order: template.order + index,
            config,
          },
          lane,
          target.variantId,
        );
      });

      if (laneNodes.length === 0) {
        const adaptId = `adapt__${lane}`;
        laneNodes.push(
          this.toPipelineNode(
            {
              nodeId: adaptId,
              type: WorkflowNodeType.Adapt,
              order: branchNode.order + 1,
              isLocked: false,
              config: {
                channel: channel.channel,
                contentStyle: channel.contentStyle,
              },
            },
            lane,
            target.variantId,
          ),
        );
      }

      laneEntryIds.push(laneNodes[0].nodeId);
      laneExitIds.push(laneNodes[laneNodes.length - 1].nodeId);
      materializedNodes.push(...laneNodes);
    }

    materializedNodes.push(this.toPipelineNode(mergeNode, null));

    const materializedEdges: WorkflowGraphEdge[] = [];

    for (const node of trunkNodes) {
      for (const edge of effectiveEdges) {
        if (edge.from === node.nodeId && edge.to === branchNode.nodeId) {
          continue;
        }
        if (
          edge.from === node.nodeId &&
          !subgraphIds.has(edge.to) &&
          edge.to !== branchNode.nodeId &&
          edge.to !== mergeNode.nodeId
        ) {
          materializedEdges.push({ from: edge.from, to: edge.to });
        }
        if (
          edge.to === node.nodeId &&
          !subgraphIds.has(edge.from) &&
          edge.from !== branchNode.nodeId
        ) {
          materializedEdges.push({ from: edge.from, to: edge.to });
        }
      }
    }

    for (const edge of branchIncoming) {
      if (subgraphIds.has(edge.from) || edge.from === mergeNode.nodeId) {
        continue;
      }
      for (const entryId of laneEntryIds) {
        materializedEdges.push({ from: edge.from, to: entryId });
      }
    }

    for (const target of abTargets) {
      const lane = normalizeLaneId(target.channel.channel);
      const laneNodeList = materializedNodes.filter((n) => n.lane === lane);
      const laneIdSet = new Set(laneNodeList.map((n) => n.nodeId));
      for (const edge of effectiveEdges) {
        if (!subgraphIds.has(edge.from) || !subgraphIds.has(edge.to)) {
          continue;
        }
        const baseFrom = edge.from;
        const baseTo = edge.to;
        const from = `${baseFrom}__${lane}`;
        const to = `${baseTo}__${lane}`;
        if (laneIdSet.has(from) && laneIdSet.has(to)) {
          materializedEdges.push({ from, to });
        }
      }
      const sortedLane = topologicalSort(
        [...laneIdSet],
        materializedEdges.filter(
          (e) => laneIdSet.has(e.from) && laneIdSet.has(e.to),
        ),
      );
      if (sortedLane.length > 1) {
        for (let i = 0; i < sortedLane.length - 1; i += 1) {
          const a = sortedLane[i];
          const b = sortedLane[i + 1];
          if (
            !materializedEdges.some((e) => e.from === a && e.to === b) &&
            !materializedEdges.some((e) => e.from === b && e.to === a)
          ) {
            const hasPath = materializedEdges.some(
              (e) => e.from === a && e.to === b,
            );
            if (!hasPath) {
              materializedEdges.push({ from: a, to: b });
            }
          }
        }
      }
    }

    for (let i = 0; i < laneExitIds.length; i += 1) {
      materializedEdges.push({
        from: laneExitIds[i],
        to: mergeNode.nodeId,
      });
    }

    for (const edge of mergeOutgoing) {
      materializedEdges.push({ from: mergeNode.nodeId, to: edge.to });
    }

    const orderedNodes = this.reindexOrders(
      materializedNodes,
      materializedEdges,
    );

    return {
      nodes: orderedNodes,
      edges: materializedEdges,
      lanes,
    };
  }

  private withoutMaterialization(
    templateNodes: WorkflowNodeTemplate[],
    templateEdges: WorkflowGraphEdge[],
  ): MaterializedPipeline {
    const edges =
      templateEdges.length > 0
        ? templateEdges
        : buildLinearEdgesFromOrder(templateNodes);
    return {
      nodes: templateNodes.map((n) => this.toPipelineNode(n, null)),
      edges,
      lanes: [],
    };
  }

  private resolveAbTargets(
    branchConfig: BranchConfig,
    ruleChannels: ChannelEntry[],
  ): AbVariantTarget[] {
    if (branchConfig.mode === 'ab_test' && branchConfig.variants?.length) {
      return branchConfig.variants.map((v) => {
        const channel =
          ruleChannels.find(
            (ch) =>
              normalizeLaneId(ch.channel) ===
              normalizeLaneId(v.channel ?? ch.channel),
          ) ?? ruleChannels[0];
        if (!channel) {
          throw new BadRequestException('A/B test requires rule channels');
        }
        return { channel, variantId: v.id };
      });
    }
    const channels = this.resolveChannels(branchConfig, ruleChannels);
    return channels.map((channel) => ({ channel, variantId: 'control' }));
  }

  private resolveChannels(
    branchConfig: BranchConfig,
    ruleChannels: ChannelEntry[],
  ): ChannelEntry[] {
    if (
      branchConfig.mode === 'wizard_channels' &&
      Array.isArray(branchConfig.channels) &&
      branchConfig.channels.length > 0
    ) {
      return channelIdsToChannelEntries(branchConfig.channels, ruleChannels);
    }
    const ids = ruleChannelNamesToIds(ruleChannels);
    if (ids.length > 0) {
      return channelIdsToChannelEntries(ids, ruleChannels);
    }
    return ruleChannels;
  }

  private collectSubgraphNodeIds(
    edges: WorkflowGraphEdge[],
    branchId: string,
    mergeId: string,
  ): Set<string> {
    const subgraph = new Set<string>();
    const queue = getOutgoing(edges, branchId).map((e) => e.to);
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === mergeId || subgraph.has(current)) {
        continue;
      }
      subgraph.add(current);
      for (const edge of getOutgoing(edges, current)) {
        if (edge.to !== mergeId) {
          queue.push(edge.to);
        }
      }
    }
    return subgraph;
  }

  private toPipelineNode(
    node: WorkflowNodeTemplate,
    lane: string | null,
    variantId: string | null = null,
  ): MaterializedPipelineNode {
    return {
      nodeId: node.nodeId,
      type: node.type,
      order: node.order,
      isLocked: node.isLocked,
      userPrompt: node.userPrompt ?? '',
      config: node.config ?? {},
      lane,
      variantId,
    };
  }

  private reindexOrders(
    nodes: MaterializedPipelineNode[],
    edges: WorkflowGraphEdge[],
  ): MaterializedPipelineNode[] {
    const sorted = topologicalSort(
      nodes.map((n) => n.nodeId),
      edges,
    );
    const orderMap = new Map(sorted.map((id, index) => [id, index + 1]));
    return nodes.map((n) => ({
      ...n,
      order: orderMap.get(n.nodeId) ?? n.order,
    }));
  }
}
