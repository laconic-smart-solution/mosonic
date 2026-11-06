import { WorkflowNodeType } from '../nodes/schemas/workflow-node.schema';
import { PipelineNodeExecutionStatus } from '../pipeline/schemas/pipeline.schema';
import { parsePipelineNodeOutputString } from '../pipeline/pipeline-output-parse';
import { normalizeLaneId } from '../workflow/workflow-graph.util';
import { isVideoNodeType } from '../nodes/video-node-type.util';

type PipelineNodeLike = {
  lane?: string | null;
  type: WorkflowNodeType | string;
  status: PipelineNodeExecutionStatus | string;
  output: string | null;
};

function extractMediaFromNode(node: PipelineNodeLike): {
  image?: string;
  video?: string;
} {
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
  if (isVideoNodeType(node.type)) {
    const url = typeof parsed.video === 'string' ? parsed.video.trim() : '';
    if (url) video = url;
  }
  return { image, video };
}

export type LaneMedia = {
  /** Ordered image URLs from every completed image node on this lane (or trunk). */
  images: string[];
  /** Last image (compat with single-slot callers). */
  image?: string;
  /** Last video URL on the lane/trunk. */
  video?: string;
  videos: string[];
};

function collectMedia(
  pipelineNodes: PipelineNodeLike[],
  predicate: (nodeLane: string | null) => boolean,
): LaneMedia {
  const images: string[] = [];
  const videos: string[] = [];
  const seenImg = new Set<string>();
  const seenVid = new Set<string>();

  for (const node of pipelineNodes) {
    const nodeLane = node.lane ? normalizeLaneId(node.lane) : null;
    if (!predicate(nodeLane)) continue;
    const media = extractMediaFromNode(node);
    if (media.image && !seenImg.has(media.image)) {
      seenImg.add(media.image);
      images.push(media.image);
    }
    if (media.video && !seenVid.has(media.video)) {
      seenVid.add(media.video);
      videos.push(media.video);
    }
  }

  return {
    images,
    image: images.length ? images[images.length - 1] : undefined,
    videos,
    video: videos.length ? videos[videos.length - 1] : undefined,
  };
}

/** All completed image/video URLs on this lane, order preserved (pipeline node order). */
export function laneMediaFromPipelineNodes(
  pipelineNodes: PipelineNodeLike[],
  lane: string,
): LaneMedia {
  const target = normalizeLaneId(lane);
  return collectMedia(pipelineNodes, (nodeLane) => nodeLane === target);
}

/**
 * Shared (pre-branch) media from nodes with no lane assignment.
 * Do not use flattened resolvedOutputs.image — that mixes in per-lane media.
 */
export function trunkMediaFromPipelineNodes(
  pipelineNodes: PipelineNodeLike[],
): LaneMedia {
  return collectMedia(pipelineNodes, (nodeLane) => !nodeLane);
}
