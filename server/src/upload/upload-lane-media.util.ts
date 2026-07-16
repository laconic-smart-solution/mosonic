import { WorkflowNodeType } from '../nodes/schemas/workflow-node.schema';
import { PipelineNodeExecutionStatus } from '../pipeline/schemas/pipeline.schema';
import { parsePipelineNodeOutputString } from '../pipeline/pipeline-output-parse';
import { normalizeLaneId } from '../workflow/workflow-graph.util';

type PipelineNodeLike = {
  lane?: string | null;
  type: WorkflowNodeType | string;
  status: PipelineNodeExecutionStatus | string;
  output: string | null;
};

function extractMediaFromNode(
  node: PipelineNodeLike,
): { image?: string; video?: string } {
  if (
    node.status !== PipelineNodeExecutionStatus.Completed &&
    node.status !== PipelineNodeExecutionStatus.Skipped
  ) {
    return {};
  }
  const parsed = parsePipelineNodeOutputString(node.output);
  if (!parsed) return {};

  let image: string | undefined;
  let video: string | undefined;
  if (node.type === WorkflowNodeType.ImageGeneration) {
    const url = typeof parsed.image === 'string' ? parsed.image.trim() : '';
    if (url) image = url;
  }
  if (node.type === WorkflowNodeType.VideoGeneration) {
    const url = typeof parsed.video === 'string' ? parsed.video.trim() : '';
    if (url) video = url;
  }
  return { image, video };
}

/** Last-wins lane image/video from completed pipeline nodes on this lane. */
export function laneMediaFromPipelineNodes(
  pipelineNodes: PipelineNodeLike[],
  lane: string,
): { image?: string; video?: string } {
  const target = normalizeLaneId(lane);
  let image: string | undefined;
  let video: string | undefined;

  for (const node of pipelineNodes) {
    const nodeLane = node.lane ? normalizeLaneId(node.lane) : null;
    if (nodeLane !== target) continue;
    const media = extractMediaFromNode(node);
    if (media.image) image = media.image;
    if (media.video) video = media.video;
  }

  return { image, video };
}

/**
 * Shared (pre-branch) media from nodes with no lane assignment.
 * Do not use flattened resolvedOutputs.image — that mixes in per-lane media.
 */
export function trunkMediaFromPipelineNodes(
  pipelineNodes: PipelineNodeLike[],
): { image?: string; video?: string } {
  let image: string | undefined;
  let video: string | undefined;

  for (const node of pipelineNodes) {
    const nodeLane = node.lane ? normalizeLaneId(node.lane) : null;
    if (nodeLane) continue;
    const media = extractMediaFromNode(node);
    if (media.image) image = media.image;
    if (media.video) video = media.video;
  }

  return { image, video };
}
