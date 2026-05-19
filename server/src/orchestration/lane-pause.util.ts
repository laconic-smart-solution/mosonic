import type { PipelineDocument } from '../pipeline/schemas/pipeline.schema';
import { PipelineNodeExecutionStatus } from '../pipeline/schemas/pipeline.schema';

/** Whether a pending node should be withheld while a lane is paused. */
export function isNodeBlockedByLanePause(
  pipeline: PipelineDocument,
  nodeId: string,
  laneScopedPause: boolean,
): boolean {
  if (!laneScopedPause || !pipeline.pausedLaneId) {
    return false;
  }
  const node = (pipeline.nodes ?? []).find((n) => n.nodeId === nodeId);
  if (!node) {
    return false;
  }
  const pausedLane = pipeline.pausedLaneId.trim();
  const nodeLane = node.lane?.trim() || null;
  return nodeLane === pausedLane;
}

export function isSharedTrunkFailure(
  pipeline: PipelineDocument,
  failedNodeId: string,
): boolean {
  const node = (pipeline.nodes ?? []).find((n) => n.nodeId === failedNodeId);
  return !node?.lane?.trim();
}

export function countNodesByLane(
  pipeline: PipelineDocument,
): Record<string, { completed: number; total: number }> {
  const byLane: Record<string, { completed: number; total: number }> = {
    _shared: { completed: 0, total: 0 },
  };
  for (const node of pipeline.nodes ?? []) {
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
