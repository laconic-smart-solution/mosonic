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
    if (
      node.status !== PipelineNodeExecutionStatus.Completed &&
      node.status !== PipelineNodeExecutionStatus.Skipped
    ) {
      continue;
    }
    const parsed = parsePipelineNodeOutputString(node.output);
    if (!parsed) continue;

    if (node.type === WorkflowNodeType.ImageGeneration) {
      const url = typeof parsed.image === 'string' ? parsed.image.trim() : '';
      if (url) image = url;
    }
    if (node.type === WorkflowNodeType.VideoGeneration) {
      const url = typeof parsed.video === 'string' ? parsed.video.trim() : '';
      if (url) video = url;
    }
  }

  return { image, video };
}
