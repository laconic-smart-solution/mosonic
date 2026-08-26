import type { Prisma } from '@prisma/client';
import type {
  PipelineNodeExecution,
  PipelineRecord,
} from '../domain/pipeline/pipeline.types';
import { parsePipelineNodes } from '../repositories/prisma/pipeline-nodes.util';

/**
 * Keep pipeline nodes that belong to a finalized content artifact.
 * - Trunk nodes (no variantId) are always included.
 * - Default (non-A/B) finalization uses variantId=null and keeps control lanes.
 * - A/B finalization passes a concrete variant id and keeps only that variant's lanes.
 */
export function filterPipelineNodesForVariant(
  nodes: PipelineNodeExecution[],
  variantId: string | null,
): PipelineNodeExecution[] {
  return nodes.filter((n) => {
    if (!n.variantId) return true;
    if (!variantId || variantId === 'control') {
      return n.variantId === 'control';
    }
    return n.variantId === variantId;
  });
}

export function filterPipelineForVariant(
  pipeline: PipelineRecord,
  variantId: string | null,
): PipelineRecord {
  const nodes = filterPipelineNodesForVariant(
    parsePipelineNodes(pipeline.nodes),
    variantId,
  );
  return { ...pipeline, nodes: nodes as unknown as Prisma.JsonValue };
}
