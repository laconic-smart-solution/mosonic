import { WorkflowNodeType } from '../../nodes/workflow-node-llm.enums';

/**
 * Common words a model reaches for when it doesn't already know a node's
 * real id (seen in practice: "image", "the image node") — mapped to the
 * actual WorkflowNodeType so rerun_content_node can resolve them without
 * forcing an extra list_workflows round-trip first.
 */
const TYPE_ALIASES: Record<string, WorkflowNodeType> = {
  image: WorkflowNodeType.ImageGeneration,
  images: WorkflowNodeType.ImageGeneration,
  photo: WorkflowNodeType.ImageGeneration,
  picture: WorkflowNodeType.ImageGeneration,
  image_generation: WorkflowNodeType.ImageGeneration,
  text: WorkflowNodeType.TextGeneration,
  caption: WorkflowNodeType.TextGeneration,
  copy: WorkflowNodeType.TextGeneration,
  text_generation: WorkflowNodeType.TextGeneration,
  video: WorkflowNodeType.VideoGeneration,
  video_generation: WorkflowNodeType.VideoGeneration,
  presenter: WorkflowNodeType.VideoPresenter,
  presenter_video: WorkflowNodeType.VideoPresenter,
  video_presenter: WorkflowNodeType.VideoPresenter,
  avatar_video: WorkflowNodeType.VideoPresenter,
  cinematic: WorkflowNodeType.VideoCinematic,
  cinematic_video: WorkflowNodeType.VideoCinematic,
  video_cinematic: WorkflowNodeType.VideoCinematic,
  sora: WorkflowNodeType.VideoCinematic,
  heygen_video: WorkflowNodeType.VideoCinematic,
  translation: WorkflowNodeType.Translation,
  transcription: WorkflowNodeType.Transcription,
  transcript: WorkflowNodeType.Transcription,
  transcribe: WorkflowNodeType.Transcription,
  subtitle: WorkflowNodeType.Subtitle,
  subtitles: WorkflowNodeType.Subtitle,
  captions_file: WorkflowNodeType.Subtitle,
  srt: WorkflowNodeType.Subtitle,
  vtt: WorkflowNodeType.Subtitle,
  summary: WorkflowNodeType.Summarization,
  summarization: WorkflowNodeType.Summarization,
  keyword: WorkflowNodeType.KeywordPlanner,
  keywords: WorkflowNodeType.KeywordPlanner,
  keyword_planner: WorkflowNodeType.KeywordPlanner,
};

export type WorkflowNodeLike = { nodeId: string; type: string };

export type NodeAliasResolution =
  | { kind: 'exact'; nodeId: string }
  | { kind: 'resolved'; nodeId: string; matchedType: WorkflowNodeType }
  | { kind: 'ambiguous'; candidates: string[]; matchedType: WorkflowNodeType }
  | { kind: 'not_found' };

/**
 * Resolves whatever a model passed as `nodeId` into a real workflow node id
 * — either it's already the real id, or it's a node-type word ("image",
 * "translation", ...) that we can resolve when exactly one node of that
 * type exists on this workflow.
 */
export function resolveContentNodeAlias(
  requested: string,
  workflowNodes: WorkflowNodeLike[],
): NodeAliasResolution {
  const trimmed = requested.trim();
  if (!trimmed) return { kind: 'not_found' };

  if (workflowNodes.some((n) => n.nodeId === trimmed)) {
    return { kind: 'exact', nodeId: trimmed };
  }

  const normalized = trimmed.toLowerCase().replace(/[\s-]+/g, '_');
  const matchedType = TYPE_ALIASES[normalized];
  if (!matchedType) return { kind: 'not_found' };

  const matches = workflowNodes.filter((n) => n.type === matchedType);
  if (matches.length === 0) return { kind: 'not_found' };
  if (matches.length === 1) {
    return { kind: 'resolved', nodeId: matches[0].nodeId, matchedType };
  }
  return {
    kind: 'ambiguous',
    candidates: matches.map((m) => m.nodeId),
    matchedType,
  };
}
