import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { WorkflowNodeType } from '../nodes/schemas/workflow-node.schema';
import {
  assertEdgesRespectMatrix,
  buildWorkflowEdges,
} from './workflow-graph-edge-builder.util';
import type { GraphNodeSpec } from './workflow-graph-expand.util';
import { expandGraphLaneTemplates } from './workflow-graph-expand.util';
import { assertValidWorkflowNodeOrder } from './workflow-node-order.util';
import {
  buildLinearEdgesFromOrder,
  normalizeLaneId,
  topologicalSort,
  validateWorkflowGraph,
  type WorkflowGraphEdge,
} from './workflow-graph.util';
import { LANE_NODE_ORDER } from './workflow-node-next-matrix';

export type PipelineNodeInput = {
  nodeId: string;
  type: WorkflowNodeType;
  order: number;
  isLocked: boolean;
  userPrompt?: string;
  config?: Record<string, unknown>;
  lane?: string | null;
};

export type PipelineGraphInput = {
  edges: WorkflowGraphEdge[];
  lanes: string[];
  layout?: Record<string, { x: number; y: number }>;
};

export type CollapsedWorkflowTemplate = {
  nodes: GraphNodeSpec[];
  edges: WorkflowGraphEdge[];
  layout: Record<string, { x: number; y: number }>;
};

const SHARED_LANE_TEMPLATE_TYPES = new Set<WorkflowNodeType>([
  WorkflowNodeType.Adapt,
  WorkflowNodeType.ImageGeneration,
  WorkflowNodeType.VideoGeneration,
  WorkflowNodeType.Summarization,
  WorkflowNodeType.Translation,
]);

export function stripLaneSuffix(
  nodeId: string,
  lanes: string[],
): { baseId: string; lane: string | null } {
  const normalized = lanes.map((l) => normalizeLaneId(l)).filter(Boolean);
  const sorted = [...normalized].sort((a, b) => b.length - a.length);
  for (const lane of sorted) {
    const suffix = `__${lane}`;
    if (
      nodeId.length > suffix.length &&
      nodeId.toLowerCase().endsWith(suffix.toLowerCase())
    ) {
      return { baseId: nodeId.slice(0, -suffix.length), lane };
    }
  }
  return { baseId: nodeId, lane: null };
}

function normalizeTemplateId(baseId: string): string {
  if (baseId === 'adapt' || baseId.startsWith('adapt__')) {
    return 'adapt';
  }
  return baseId;
}

function cleanLaneConfig(
  type: WorkflowNodeType,
  config: Record<string, unknown>,
  isShared: boolean,
  lane: string | null,
): Record<string, unknown> {
  const next = { ...config };
  delete next.channel;
  delete next.contentStyle;
  if (isShared) {
    delete next.laneId;
  } else if (lane) {
    next.laneId = normalizeLaneId(lane);
  }
  if (type === WorkflowNodeType.Adapt && isShared) {
    delete next.channel;
    delete next.contentStyle;
  }
  return next;
}

function isMaterializedGraph(
  graph: PipelineGraphInput,
  nodes: PipelineNodeInput[],
): boolean {
  if ((graph.lanes?.length ?? 0) >= 2) {
    return true;
  }
  return nodes.some((n) => Boolean(n.lane?.trim()));
}

function validateCollapsed(
  nodes: GraphNodeSpec[],
  edges: WorkflowGraphEdge[],
): void {
  assertValidWorkflowNodeOrder(
    nodes.map((n) => ({
      type: n.type,
      order: n.order,
      config: n.config,
    })),
  );
  const forValidation = nodes.map((n) => ({
    nodeId: n.nodeId,
    type: n.type,
    order: n.order,
  }));
  validateWorkflowGraph(forValidation, edges);
  if (edges.length > 0) {
    assertEdgesRespectMatrix(forValidation, edges);
  }
}

function toGraphNode(
  node: PipelineNodeInput,
  order: number,
  nodeId?: string,
  lane?: string | null,
  config?: Record<string, unknown>,
): GraphNodeSpec {
  return {
    nodeId: nodeId ?? node.nodeId,
    type: node.type,
    order,
    isLocked: node.isLocked,
    config: config ?? { ...(node.config ?? {}) },
    userPrompt: node.userPrompt ?? '',
    lane: lane ?? node.lane ?? null,
  };
}

function collapseLinear(
  nodes: PipelineNodeInput[],
  edges: WorkflowGraphEdge[],
  layout: Record<string, { x: number; y: number }>,
): CollapsedWorkflowTemplate {
  const templateNodes = [...nodes]
    .sort((a, b) => a.order - b.order)
    .map((n, idx) =>
      toGraphNode(n, idx + 1, n.nodeId, n.lane ?? null, {
        ...(n.config ?? {}),
      }),
    );

  const templateLayout: Record<string, { x: number; y: number }> = {};
  for (const n of templateNodes) {
    const pos = layout[n.nodeId];
    if (pos) {
      templateLayout[n.nodeId] = pos;
    }
  }

  const templateEdges =
    edges.length > 0 ? edges : buildLinearEdgesFromOrder(templateNodes);

  validateCollapsed(templateNodes, templateEdges);
  return { nodes: templateNodes, edges: templateEdges, layout: templateLayout };
}

function laneTypePriorityForCollapse(type: WorkflowNodeType): number {
  if (type === WorkflowNodeType.Adapt) return -1;
  const idx = (LANE_NODE_ORDER as readonly string[]).indexOf(type);
  return idx === -1 ? 99 : idx;
}

function laneKeyForPipelineNode(
  node: PipelineNodeInput,
  lanes: string[],
): string {
  const { lane } = stripLaneSuffix(node.nodeId, lanes);
  const laneKey = lane ?? node.lane?.trim() ?? '';
  return laneKey ? normalizeLaneId(laneKey) : '';
}

function lanesPresentInGroup(
  group: PipelineNodeInput[],
  lanes: string[],
): Set<string> {
  const present = new Set<string>();
  for (const n of group) {
    const key = laneKeyForPipelineNode(n, lanes);
    if (key) present.add(key);
  }
  return present;
}

/** Shared when on every lane, or a lone Adapt template when all lane entries are adapt. */
function isSharedLaneTemplate(
  group: PipelineNodeInput[],
  lanes: string[],
  type: WorkflowNodeType,
  heterogeneousLaneEntries: boolean,
): boolean {
  if (!SHARED_LANE_TEMPLATE_TYPES.has(type)) return false;
  if (lanes.length < 2) return false;
  if (type === WorkflowNodeType.Adapt && group.length === 1) {
    return !heterogeneousLaneEntries;
  }
  const present = lanesPresentInGroup(group, lanes);
  return lanes.every((lane) => present.has(normalizeLaneId(lane)));
}

function pipelineHasNonAdaptLaneEntry(
  edges: WorkflowGraphEdge[],
  fanOutTrunkId: string | null,
  nodes: PipelineNodeInput[],
  laneNodeIds: Set<string>,
): boolean {
  if (!fanOutTrunkId) return false;
  const nodeById = new Map(nodes.map((n) => [n.nodeId, n]));
  for (const edge of edges) {
    if (edge.from !== fanOutTrunkId || !laneNodeIds.has(edge.to)) continue;
    const target = nodeById.get(edge.to);
    if (target && target.type !== WorkflowNodeType.Adapt) return true;
  }
  return false;
}

function perLaneTemplateNodeId(templateId: string, lane: string): string {
  return `${templateId}__${normalizeLaneId(lane)}`;
}

function resolveTemplateNodeId(
  materializedId: string,
  groups: Map<string, PipelineNodeInput[]>,
  lanes: string[],
  heterogeneousLaneEntries: boolean,
): string {
  const { baseId, lane } = stripLaneSuffix(materializedId, lanes);
  const templateId = normalizeTemplateId(baseId);
  const group = groups.get(templateId);
  if (!group?.length) return materializedId;
  if (
    isSharedLaneTemplate(group, lanes, group[0].type, heterogeneousLaneEntries)
  ) {
    return templateId;
  }
  const laneNorm = normalizeLaneId(lane ?? '');
  if (laneNorm) return perLaneTemplateNodeId(templateId, laneNorm);
  return templateId;
}

function findFanOutTrunkId(
  trunkNodes: PipelineNodeInput[],
  laneNodeIds: Set<string>,
  edges: WorkflowGraphEdge[],
): string | null {
  let best: { id: string; count: number } | null = null;
  for (const trunk of trunkNodes) {
    const count = edges.filter(
      (e) => e.from === trunk.nodeId && laneNodeIds.has(e.to),
    ).length;
    if (count > 0 && (!best || count > best.count)) {
      best = { id: trunk.nodeId, count };
    }
  }
  return best?.id ?? null;
}

function edgeDedupKey(edge: WorkflowGraphEdge): string {
  return `${edge.from}|${edge.sourceHandle ?? ''}|${edge.to}|${edge.targetHandle ?? ''}`;
}

function rebuildTemplateEdgesFromPipeline(
  pipelineEdges: WorkflowGraphEdge[],
  lanes: string[],
  branchId: string,
  mergeId: string,
  fanOutTrunkId: string | null,
  groups: Map<string, PipelineNodeInput[]>,
  laneNodeIds: Set<string>,
  heterogeneousLaneEntries: boolean,
): WorkflowGraphEdge[] {
  const out: WorkflowGraphEdge[] = [];
  const seen = new Set<string>();
  const add = (edge: WorkflowGraphEdge) => {
    const key = edgeDedupKey(edge);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(edge);
  };

  if (fanOutTrunkId) {
    add({ from: fanOutTrunkId, to: branchId });
  }

  for (const edge of pipelineEdges) {
    const fromLane = laneNodeIds.has(edge.from);
    const toLane = laneNodeIds.has(edge.to);
    const fromIsFanOut =
      fanOutTrunkId != null && edge.from === fanOutTrunkId && toLane;

    if (fromIsFanOut) {
      const laneFromSuffix = stripLaneSuffix(edge.to, lanes).lane;
      const laneHandle =
        (laneFromSuffix ? normalizeLaneId(laneFromSuffix) : '') ||
        edge.sourceHandle?.trim();
      add({
        from: branchId,
        to: resolveTemplateNodeId(
          edge.to,
          groups,
          lanes,
          heterogeneousLaneEntries,
        ),
        ...(laneHandle ? { sourceHandle: normalizeLaneId(laneHandle) } : {}),
      });
      continue;
    }

    if (toLane && edge.to === mergeId) {
      const laneFromSuffix = stripLaneSuffix(edge.from, lanes).lane;
      const laneHandle =
        (laneFromSuffix ? normalizeLaneId(laneFromSuffix) : '') ||
        edge.targetHandle?.trim();
      add({
        from: resolveTemplateNodeId(
          edge.from,
          groups,
          lanes,
          heterogeneousLaneEntries,
        ),
        to: mergeId,
        ...(laneHandle ? { targetHandle: normalizeLaneId(laneHandle) } : {}),
      });
      continue;
    }

    if (fromLane && toLane) {
      add({
        from: resolveTemplateNodeId(
          edge.from,
          groups,
          lanes,
          heterogeneousLaneEntries,
        ),
        to: resolveTemplateNodeId(
          edge.to,
          groups,
          lanes,
          heterogeneousLaneEntries,
        ),
        ...(edge.sourceHandle ? { sourceHandle: edge.sourceHandle } : {}),
        ...(edge.targetHandle ? { targetHandle: edge.targetHandle } : {}),
      });
      continue;
    }

    if (!fromLane && !toLane && edge.to !== mergeId) {
      add({ from: edge.from, to: edge.to });
    }
  }

  return out;
}

function readLaneIdFromSpec(node: GraphNodeSpec): string {
  const fromLane = node.lane?.trim();
  if (fromLane) return normalizeLaneId(fromLane);
  const fromConfig = (node.config as { laneId?: string }).laneId?.trim();
  return fromConfig ? normalizeLaneId(fromConfig) : '';
}

function laneHasAdaptNode(nodes: GraphNodeSpec[], lane: string): boolean {
  const laneNorm = normalizeLaneId(lane);
  return nodes.some(
    (n) =>
      n.type === WorkflowNodeType.Adapt &&
      (readLaneIdFromSpec(n) === laneNorm ||
        n.nodeId === perLaneTemplateNodeId('adapt', laneNorm)),
  );
}

function findSharedLaneTemplate(
  nodes: GraphNodeSpec[],
  type: WorkflowNodeType,
): GraphNodeSpec | undefined {
  return nodes.find((n) => n.type === type && !readLaneIdFromSpec(n));
}

function ensureLaneAdaptEntries(
  nodes: GraphNodeSpec[],
  edges: WorkflowGraphEdge[],
  branchId: string,
): { nodes: GraphNodeSpec[]; edges: WorkflowGraphEdge[] } {
  const sharedAdapt = findSharedLaneTemplate(nodes, WorkflowNodeType.Adapt);
  const nextNodes = [...nodes];
  const nextEdges = [...edges];

  if (sharedAdapt) {
    for (const edge of edges.filter((e) => e.from === branchId)) {
      const target = nextNodes.find((n) => n.nodeId === edge.to);
      if (!target || target.type === WorkflowNodeType.Adapt) continue;

      const lane =
        edge.sourceHandle?.trim() || readLaneIdFromSpec(target) || '';
      if (!lane) continue;

      const edgeIdx = nextEdges.findIndex(
        (e) =>
          e.from === edge.from &&
          e.to === edge.to &&
          (e.sourceHandle ?? '') === (edge.sourceHandle ?? ''),
      );
      if (edgeIdx >= 0) nextEdges.splice(edgeIdx, 1);

      if (
        !nextEdges.some(
          (e) =>
            e.from === branchId &&
            e.to === sharedAdapt.nodeId &&
            normalizeLaneId(e.sourceHandle ?? '') === normalizeLaneId(lane),
        )
      ) {
        nextEdges.push({
          from: branchId,
          to: sharedAdapt.nodeId,
          sourceHandle: normalizeLaneId(lane),
        });
      }
    }
    return { nodes: nextNodes, edges: nextEdges };
  }

  for (const edge of edges.filter((e) => e.from === branchId)) {
    const lane = edge.sourceHandle?.trim();
    if (!lane) continue;
    const target = nextNodes.find((n) => n.nodeId === edge.to);
    if (!target || target.type === WorkflowNodeType.Adapt) continue;
    if (laneHasAdaptNode(nextNodes, lane)) continue;

    const adaptId = perLaneTemplateNodeId('adapt', lane);
    if (!nextNodes.some((n) => n.nodeId === adaptId)) {
      nextNodes.push({
        nodeId: adaptId,
        type: WorkflowNodeType.Adapt,
        order: target.order,
        isLocked: false,
        config: { laneId: normalizeLaneId(lane) },
        userPrompt: '',
        lane: normalizeLaneId(lane),
      });
    }

    const edgeIdx = nextEdges.findIndex(
      (e) =>
        e.from === edge.from &&
        e.to === edge.to &&
        (e.sourceHandle ?? '') === (edge.sourceHandle ?? ''),
    );
    if (edgeIdx >= 0) nextEdges.splice(edgeIdx, 1);
    nextEdges.push({
      from: branchId,
      to: adaptId,
      sourceHandle: normalizeLaneId(lane),
    });
    nextEdges.push({ from: adaptId, to: target.nodeId });
  }

  return { nodes: nextNodes, edges: nextEdges };
}

/** Keep at most one adapt node per lane (avoids adapt→adapt when collapsing/applying). */
export function dedupeAdaptNodesPerLane(
  nodes: GraphNodeSpec[],
): GraphNodeSpec[] {
  const laneIds = [
    ...new Set(nodes.map(readLaneIdFromSpec).filter((lane) => lane.length > 0)),
  ];
  const toRemove = new Set<string>();

  for (const lane of laneIds) {
    const adapts = nodes.filter(
      (n) =>
        n.type === WorkflowNodeType.Adapt && readLaneIdFromSpec(n) === lane,
    );
    if (adapts.length <= 1) continue;

    const canonicalId = perLaneTemplateNodeId('adapt', lane);
    const keep =
      adapts.find((n) => n.nodeId === canonicalId) ??
      [...adapts].sort((a, b) => a.order - b.order)[0];

    for (const adapt of adapts) {
      if (adapt.nodeId !== keep.nodeId) toRemove.add(adapt.nodeId);
    }
  }

  return nodes.filter((n) => !toRemove.has(n.nodeId));
}

function buildLaneTemplateOrder(
  groups: Map<string, PipelineNodeInput[]>,
  lanes: string[],
  laneNodes: PipelineNodeInput[],
  edges: WorkflowGraphEdge[],
): string[] {
  let bestOrder: string[] = [];

  for (const lane of lanes) {
    const laneNorm = normalizeLaneId(lane);
    const materializedIds = new Set(
      laneNodes
        .filter((n) => {
          const { lane: laneFromId } = stripLaneSuffix(n.nodeId, lanes);
          const laneKey = laneFromId ?? n.lane?.trim() ?? '';
          return normalizeLaneId(laneKey) === laneNorm;
        })
        .map((n) => n.nodeId),
    );
    if (materializedIds.size === 0) continue;

    const laneEdges = edges.filter(
      (e) => materializedIds.has(e.from) && materializedIds.has(e.to),
    );
    const sorted = topologicalSort([...materializedIds], laneEdges);
    const order: string[] = [];
    for (const materializedId of sorted) {
      const { baseId } = stripLaneSuffix(materializedId, lanes);
      const templateId = normalizeTemplateId(baseId);
      if (!order.includes(templateId)) {
        order.push(templateId);
      }
    }
    if (order.length > bestOrder.length) {
      bestOrder = order;
    }
  }

  const missing = [...groups.keys()]
    .filter((id) => !bestOrder.includes(id))
    .sort((a, b) => {
      const typeA = groups.get(a)?.[0]?.type ?? WorkflowNodeType.Adapt;
      const typeB = groups.get(b)?.[0]?.type ?? WorkflowNodeType.Adapt;
      return (
        laneTypePriorityForCollapse(typeA) - laneTypePriorityForCollapse(typeB)
      );
    });

  return [...bestOrder, ...missing];
}

function findBranchLayoutId(
  layout: Record<string, { x: number; y: number }>,
  pipelineNodeIds: Set<string>,
): string | undefined {
  return Object.keys(layout).find(
    (id) => !pipelineNodeIds.has(id) && !id.includes('__'),
  );
}

function collapseMaterialized(
  nodes: PipelineNodeInput[],
  edges: WorkflowGraphEdge[],
  lanes: string[],
  layout: Record<string, { x: number; y: number }>,
): CollapsedWorkflowTemplate {
  const mergeNode = nodes.find((n) => n.type === WorkflowNodeType.Merge);
  if (!mergeNode) {
    throw new BadRequestException(
      'Materialized pipeline is missing a merge node',
    );
  }

  const mergeId = mergeNode.nodeId;
  const laneNodes = nodes.filter(
    (n) => Boolean(n.lane?.trim()) || stripLaneSuffix(n.nodeId, lanes).lane,
  );
  const laneNodeIds = new Set(laneNodes.map((n) => n.nodeId));
  const trunkNodes = nodes.filter(
    (n) => !laneNodeIds.has(n.nodeId) && n.nodeId !== mergeId,
  );

  let fanOutSourceId: string | null = findFanOutTrunkId(
    trunkNodes,
    laneNodeIds,
    edges,
  );

  if (!fanOutSourceId) {
    for (const trunk of trunkNodes) {
      const fanOut = edges.filter(
        (e) => e.from === trunk.nodeId && laneNodeIds.has(e.to),
      );
      if (fanOut.length >= 2) {
        fanOutSourceId = trunk.nodeId;
        break;
      }
    }
  }

  const fanOutOrder = fanOutSourceId
    ? (trunkNodes.find((t) => t.nodeId === fanOutSourceId)?.order ?? Infinity)
    : Infinity;

  const preBranchTrunk = trunkNodes
    .filter((n) => n.order <= fanOutOrder)
    .sort((a, b) => a.order - b.order);

  const postMergeTrunk = trunkNodes
    .filter((n) => n.order > mergeNode.order)
    .sort((a, b) => a.order - b.order);

  const baseIdToLanes = new Map<string, Set<string>>();
  const groups = new Map<string, PipelineNodeInput[]>();
  for (const n of laneNodes) {
    const { baseId, lane } = stripLaneSuffix(n.nodeId, lanes);
    const templateId = normalizeTemplateId(baseId);
    const laneKey = lane ?? n.lane?.trim() ?? '';
    if (laneKey) {
      if (!baseIdToLanes.has(templateId)) {
        baseIdToLanes.set(templateId, new Set());
      }
      baseIdToLanes.get(templateId)!.add(laneKey);
    }
    const bucket = groups.get(templateId) ?? [];
    bucket.push(n);
    groups.set(templateId, bucket);
  }

  const laneTemplateOrder = buildLaneTemplateOrder(
    groups,
    lanes,
    laneNodes,
    edges,
  );

  const pipelineNodeIds = new Set(nodes.map((n) => n.nodeId));
  const branchLayoutId = findBranchLayoutId(layout, pipelineNodeIds);
  const branchId = branchLayoutId ?? randomUUID();

  const heterogeneousLaneEntries = pipelineHasNonAdaptLaneEntry(
    edges,
    fanOutSourceId,
    nodes,
    laneNodeIds,
  );

  const laneTemplateNodes: GraphNodeSpec[] = [];
  for (const templateId of laneTemplateOrder) {
    const group = groups.get(templateId);
    if (!group?.length) continue;
    const representative = group[0];
    const isShared = isSharedLaneTemplate(
      group,
      lanes,
      representative.type,
      heterogeneousLaneEntries,
    );

    if (isShared) {
      laneTemplateNodes.push({
        nodeId: templateId,
        type: representative.type,
        order: 0,
        isLocked: representative.isLocked,
        config: cleanLaneConfig(
          representative.type,
          { ...(representative.config ?? {}) },
          true,
          null,
        ),
        userPrompt: representative.userPrompt ?? '',
        lane: null,
      });
      continue;
    }

    for (const lane of lanes) {
      const laneNorm = normalizeLaneId(lane);
      const instance = group.find(
        (n) => laneKeyForPipelineNode(n, lanes) === laneNorm,
      );
      if (!instance) continue;
      laneTemplateNodes.push({
        nodeId: perLaneTemplateNodeId(templateId, laneNorm),
        type: instance.type,
        order: 0,
        isLocked: instance.isLocked,
        config: cleanLaneConfig(
          instance.type,
          { ...(instance.config ?? {}) },
          false,
          laneNorm,
        ),
        userPrompt: instance.userPrompt ?? '',
        lane: laneNorm,
      });
    }
  }

  let order = 1;
  const allNodes: GraphNodeSpec[] = [];
  for (const trunk of preBranchTrunk) {
    allNodes.push(toGraphNode(trunk, order++));
  }

  allNodes.push({
    nodeId: branchId,
    type: WorkflowNodeType.Branch,
    order: order++,
    isLocked: false,
    config: { mode: 'rule_channels' },
    userPrompt: '',
    lane: null,
  });

  for (const laneTemplate of laneTemplateNodes) {
    allNodes.push({ ...laneTemplate, order: order++ });
  }

  allNodes.push(toGraphNode(mergeNode, order++, mergeId, null));

  for (const trunk of postMergeTrunk) {
    allNodes.push(toGraphNode(trunk, order++));
  }

  let templateEdges = rebuildTemplateEdgesFromPipeline(
    edges,
    lanes,
    branchId,
    mergeId,
    fanOutSourceId,
    groups,
    laneNodeIds,
    heterogeneousLaneEntries,
  );
  const withAdapt = ensureLaneAdaptEntries(allNodes, templateEdges, branchId);
  allNodes.length = 0;
  allNodes.push(...withAdapt.nodes);

  const expandedForValidation = dedupeAdaptNodesPerLane(
    expandGraphLaneTemplates(allNodes, lanes),
  );
  templateEdges = buildWorkflowEdges(expandedForValidation);
  validateCollapsed(expandedForValidation, templateEdges);

  const templateLayout: Record<string, { x: number; y: number }> = {};
  for (const n of allNodes) {
    const direct = layout[n.nodeId];
    if (direct) {
      templateLayout[n.nodeId] = direct;
      continue;
    }
    const group = groups.get(n.nodeId);
    if (group?.[0]) {
      const fromMaterialized = layout[group[0].nodeId];
      if (fromMaterialized) {
        templateLayout[n.nodeId] = fromMaterialized;
      }
    }
    const laneSuffix = n.lane?.trim();
    if (laneSuffix) {
      const baseId = n.nodeId.split('__')[0];
      const materialized = group?.find(
        (row) =>
          laneKeyForPipelineNode(row, lanes) === normalizeLaneId(laneSuffix),
      );
      if (materialized) {
        const fromMaterialized = layout[materialized.nodeId];
        if (fromMaterialized) {
          templateLayout[n.nodeId] = fromMaterialized;
        }
      }
    }
  }
  if (branchLayoutId && layout[branchLayoutId]) {
    templateLayout[branchId] = layout[branchLayoutId];
  }

  return {
    nodes: allNodes,
    edges: [],
    layout: templateLayout,
  };
}

/**
 * Dematerializes a pipeline execution snapshot into an editable workflow template.
 */
export function collapsePipelineToWorkflowTemplate(
  nodes: PipelineNodeInput[],
  graph: PipelineGraphInput,
): CollapsedWorkflowTemplate {
  if (!nodes.length) {
    throw new BadRequestException('Pipeline has no nodes to apply');
  }

  const edges = graph.edges ?? [];
  const lanes = graph.lanes ?? [];
  const layout = graph.layout ?? {};

  if (!isMaterializedGraph(graph, nodes)) {
    return collapseLinear(nodes, edges, layout);
  }
  return collapseMaterialized(nodes, edges, lanes, layout);
}
