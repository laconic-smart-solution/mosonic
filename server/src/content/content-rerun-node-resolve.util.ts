import { stripLaneSuffix } from '../workflow/pipeline-to-workflow-template.util';
import { normalizeLaneId } from '../workflow/workflow-graph.util';

export type WorkflowNodeLike = {
  nodeId: string;
  type: string;
  config?: unknown;
};

export type PipelineNodeLike = {
  nodeId: string;
  type?: string;
  lane?: string | null;
  config?: Record<string, unknown>;
};

export type ResolvedRerunTarget = {
  /** Key used in content.nodeOutputs (materialized pipeline id when applicable). */
  outputNodeId: string;
  /** Workflow template node id used for execution and config updates. */
  workflowNodeId: string;
};

export function collectPipelineLanes(
  pipelineNodes: PipelineNodeLike[],
  graphLanes?: string[],
): string[] {
  const set = new Set<string>();
  for (const lane of graphLanes ?? []) {
    const normalized = normalizeLaneId(lane);
    if (normalized) set.add(normalized);
  }
  for (const node of pipelineNodes) {
    const lane = node.lane?.trim();
    if (lane) set.add(normalizeLaneId(lane));
    const fromSuffix = stripMaterializedNodeSuffix(node.nodeId, [...set]);
    if (fromSuffix.lane) set.add(fromSuffix.lane);
  }
  return [...set];
}

/** Strip `__lane` or legacy `_lane` suffixes when lane is known. */
export function stripMaterializedNodeSuffix(
  nodeId: string,
  lanes: string[],
): { baseId: string; lane: string | null } {
  const fromDouble = stripLaneSuffix(nodeId, lanes);
  if (fromDouble.lane) return fromDouble;

  const sep = nodeId.lastIndexOf('__');
  if (sep > 0) {
    const baseId = nodeId.slice(0, sep);
    const lane = normalizeLaneId(nodeId.slice(sep + 2));
    if (baseId && lane) {
      return { baseId, lane };
    }
  }

  const sorted = [...lanes].sort((a, b) => b.length - a.length);
  for (const lane of sorted) {
    const suffix = `_${lane}`;
    if (
      nodeId.length > suffix.length &&
      nodeId.toLowerCase().endsWith(suffix.toLowerCase())
    ) {
      return { baseId: nodeId.slice(0, -suffix.length), lane };
    }
  }
  return { baseId: nodeId, lane: null };
}

export function resolveRerunWorkflowNodeId(
  requestedNodeId: string,
  workflowNodes: WorkflowNodeLike[],
  pipelineNodes: PipelineNodeLike[],
  graphLanes?: string[],
): ResolvedRerunTarget | null {
  const outputNodeId = requestedNodeId.trim();
  if (!outputNodeId) return null;

  if (workflowNodes.some((n) => n.nodeId === outputNodeId)) {
    return { outputNodeId, workflowNodeId: outputNodeId };
  }

  const lanes = collectPipelineLanes(pipelineNodes, graphLanes);
  const pipelineNode = pipelineNodes.find((n) => n.nodeId === outputNodeId);
  const { baseId, lane } = stripMaterializedNodeSuffix(outputNodeId, lanes);

  for (const wf of workflowNodes) {
    if (lane && `${wf.nodeId}__${lane}` === outputNodeId) {
      return { outputNodeId, workflowNodeId: wf.nodeId };
    }
  }

  const wfByBase = workflowNodes.find((n) => n.nodeId === baseId);
  if (wfByBase) {
    return { outputNodeId, workflowNodeId: baseId };
  }

  const laneNorm =
    lane ??
    (pipelineNode?.lane?.trim() ? normalizeLaneId(pipelineNode.lane) : null);

  if (laneNorm) {
    const adaptLaneNode = workflowNodes.find((n) => {
      if (n.type !== 'adapt') return false;
      if (n.nodeId === `adapt__${laneNorm}`) return true;
      const cfg = n.config as { laneId?: string } | undefined;
      return normalizeLaneId(cfg?.laneId ?? '') === laneNorm;
    });
    if (adaptLaneNode) {
      return { outputNodeId, workflowNodeId: adaptLaneNode.nodeId };
    }
  }

  if (pipelineNode?.type === 'adapt' && laneNorm) {
    const byLaneConfig = workflowNodes.find((n) => {
      if (n.type !== 'adapt') return false;
      const cfg = n.config as { laneId?: string } | undefined;
      return normalizeLaneId(cfg?.laneId ?? '') === laneNorm;
    });
    if (byLaneConfig) {
      return { outputNodeId, workflowNodeId: byLaneConfig.nodeId };
    }
  }

  if (pipelineNode) {
    const sameType = workflowNodes.filter((n) => n.type === pipelineNode.type);
    if (laneNorm && sameType.length > 0) {
      const byLane = sameType.find((n) => {
        const cfg = n.config as { laneId?: string } | undefined;
        const nodeLane = normalizeLaneId(cfg?.laneId ?? '');
        if (nodeLane && nodeLane === laneNorm) return true;
        return stripMaterializedNodeSuffix(n.nodeId, lanes).lane === laneNorm;
      });
      if (byLane) {
        return { outputNodeId, workflowNodeId: byLane.nodeId };
      }
    }
    if (sameType.length === 1) {
      return { outputNodeId, workflowNodeId: sameType[0].nodeId };
    }
  }

  return null;
}
