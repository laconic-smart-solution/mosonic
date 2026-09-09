import type { PipelineNodeExecutionStatus } from '@prisma/client';
import type {
  PipelineGraphSnapshot,
  PipelineNodeExecution,
} from '../../domain/pipeline/pipeline.types';

export function parsePipelineNodes(json: unknown): PipelineNodeExecution[] {
  if (!Array.isArray(json)) return [];
  return json as PipelineNodeExecution[];
}

export function parsePipelineGraph(json: unknown): PipelineGraphSnapshot {
  if (!json || typeof json !== 'object')
    return { edges: [], lanes: [], layout: {} };
  return json;
}

export type PipelineMetadata = {
  source?: string;
  scheduleId?: string;
  experimentId?: string;
  newsMeta?: { title?: string; url?: string } | null;
  /** Workflow template node IDs selected for step-mode review. */
  reviewNodeIds?: string[];
};

export function parsePipelineMetadata(json: unknown): PipelineMetadata {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return {};
  return json;
}

export function serializePipelineNodes(
  nodes: PipelineNodeExecution[],
): PipelineNodeExecution[] {
  return nodes;
}

export function updatePipelineNode(
  nodes: PipelineNodeExecution[],
  nodeId: string,
  patch: Partial<PipelineNodeExecution>,
): PipelineNodeExecution[] {
  return nodes.map((n) => (n.nodeId === nodeId ? { ...n, ...patch } : n));
}

export function incrementNodeRetry(
  nodes: PipelineNodeExecution[],
  nodeId: string,
): PipelineNodeExecution[] {
  return nodes.map((n) =>
    n.nodeId === nodeId ? { ...n, retryCount: (n.retryCount ?? 0) + 1 } : n,
  );
}

export function incrementReviewRegenerate(
  nodes: PipelineNodeExecution[],
  nodeId: string,
): PipelineNodeExecution[] {
  return nodes.map((n) =>
    n.nodeId === nodeId
      ? { ...n, reviewRegenerateCount: (n.reviewRegenerateCount ?? 0) + 1 }
      : n,
  );
}

export function applyNodeStatusUpdate(
  nodes: PipelineNodeExecution[],
  nodeId: string,
  status: PipelineNodeExecutionStatus,
  output?: Record<string, unknown>,
): PipelineNodeExecution[] {
  let next = updatePipelineNode(nodes, nodeId, {
    status,
    executedAt: new Date().toISOString(),
    ...(output !== undefined ? { output: JSON.stringify(output) } : {}),
  });
  if (status === 'failed') {
    next = incrementNodeRetry(next, nodeId);
  }
  return next;
}
