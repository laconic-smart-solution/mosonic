import type { PipelineRecord } from '../domain/pipeline/pipeline.types';
import { WorkflowNodeType } from '../nodes/schemas/workflow-node.schema';
import { PipelineUserExecutionMode } from '../pipeline/schemas/pipeline.schema';
import { parsePipelineMetadata } from '../repositories/prisma/pipeline-nodes.util';
import { effectiveUserExecutionMode } from './pipeline-user-execution-mode.util';

/** Node types that may pause for user review in step mode. */
export const REVIEWABLE_NODE_TYPES = new Set<string>([
  WorkflowNodeType.KeywordPlanner,
  WorkflowNodeType.TextGeneration,
  WorkflowNodeType.ImageGeneration,
  WorkflowNodeType.VideoGeneration,
  WorkflowNodeType.Translation,
  WorkflowNodeType.Transcription,
  WorkflowNodeType.Summarization,
  WorkflowNodeType.Adapt,
  WorkflowNodeType.Intelligence,
]);

const STRUCTURAL_NODE_TYPES = new Set<string>([
  WorkflowNodeType.Branch,
  WorkflowNodeType.Merge,
]);

/** Materialized lane nodes use `{templateNodeId}__{lane}`. */
export function resolveTemplateNodeId(pipelineNodeId: string): string {
  const idx = pipelineNodeId.indexOf('__');
  if (idx <= 0) return pipelineNodeId;
  return pipelineNodeId.slice(0, idx);
}

export function isReviewableNodeType(nodeType: string): boolean {
  return REVIEWABLE_NODE_TYPES.has(nodeType);
}

export function validateAndNormalizeReviewNodeIds(args: {
  executionMode?: 'auto' | 'step';
  reviewNodeIds?: string[];
  workflowNodes: Array<{ nodeId: string; type: string }>;
}): string[] | undefined {
  if (args.executionMode !== 'step') return undefined;
  if (args.reviewNodeIds === undefined) return undefined;

  const validIds = new Set(args.workflowNodes.map((n) => n.nodeId));
  const unique = [
    ...new Set(
      args.reviewNodeIds.map((id) => id.trim()).filter((id) => id.length > 0),
    ),
  ];

  for (const id of unique) {
    if (!validIds.has(id)) {
      throw new Error(`Unknown review node: ${id}`);
    }
    const node = args.workflowNodes.find((n) => n.nodeId === id);
    if (!node || !isReviewableNodeType(node.type)) {
      throw new Error(`Node ${id} is not reviewable`);
    }
  }

  return unique;
}

export function shouldPauseNodeForReview(
  pipeline: PipelineRecord,
  nodeId: string,
  nodeType: string,
): boolean {
  if (STRUCTURAL_NODE_TYPES.has(nodeType)) return false;
  if (!isReviewableNodeType(nodeType)) return false;

  const mode = effectiveUserExecutionMode(pipeline);
  if (mode !== PipelineUserExecutionMode.Step) return false;

  const metadata = parsePipelineMetadata(pipeline.metadata);
  const reviewNodeIds = metadata.reviewNodeIds;

  // Legacy step mode: no explicit selection → pause all reviewable nodes.
  if (reviewNodeIds === undefined) return true;

  if (reviewNodeIds.length === 0) return false;

  const templateId = resolveTemplateNodeId(nodeId);
  return reviewNodeIds.includes(templateId);
}
