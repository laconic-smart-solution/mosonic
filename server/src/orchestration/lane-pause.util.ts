import type { PipelineRecord } from '../domain/pipeline/pipeline.types';
import { parsePipelineNodes } from '../repositories/prisma/pipeline-nodes.util';
import { PipelineNodeExecutionStatus } from '../pipeline/schemas/pipeline.schema';

/** Whether a pending node should be withheld while a lane is paused. */
export function isNodeBlockedByLanePause(
  pipeline: PipelineRecord,
  nodeId: string,
  laneScopedPause: boolean,
): boolean {
  if (!laneScopedPause || !pipeline.pausedLaneId) {
    return false;
  }
  const node = parsePipelineNodes(pipeline.nodes).find((n) => n.nodeId === nodeId);
  if (!node) {
    return false;
  }
  const pausedLane = pipeline.pausedLaneId.trim();
  const nodeLane = node.lane?.trim() || null;
  return nodeLane === pausedLane;
}

export function isSharedTrunkFailure(
  pipeline: PipelineRecord,
  failedNodeId: string,
): boolean {
  const node = parsePipelineNodes(pipeline.nodes).find(
    (n) => n.nodeId === failedNodeId,
  );
  return !node?.lane?.trim();
}

export function countNodesByLane(
  pipeline: PipelineRecord,
): Record<string, { completed: number; total: number }> {
  const byLane: Record<string, { completed: number; total: number }> = {
    _shared: { completed: 0, total: 0 },
  };
  for (const node of parsePipelineNodes(pipeline.nodes)) {
    const key = node.lane?.trim() || '_shared';
    if (!byLane[key]) {
      byLane[key] = { completed: 0, total: 0 };
    }
    byLane[key].total += 1;
    if (
      node.status === PipelineNodeExecutionStatus.Completed ||
      node.status === PipelineNodeExecutionStatus.Skipped
    ) {
      byLane[key].completed += 1;
    }
  }
  return byLane;
}
