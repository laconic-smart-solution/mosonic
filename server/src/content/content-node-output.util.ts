import { WorkflowNodeType } from '../nodes/schemas/workflow-node.schema';
import type { ContentOutputs } from './schemas/content.schema';

/** nodeId → executor output object (e.g. `{ image: "..." }`). */
export type NodeOutputMap = Record<string, Record<string, unknown>>;

/** nodeId → user override fields for that node (same shape as executor slices). */
export type NodeUserEditMap = Record<string, Record<string, unknown>>;

function mergeNodeLayers(
  ai?: Record<string, unknown>,
  user?: Record<string, unknown>,
): Record<string, unknown> {
  return { ...(ai ?? {}), ...(user ?? {}) };
}

/**
 * Walk workflow nodes in order; each node's semantic fields overwrite earlier nodes
 * (last wins per field across the pipeline).
 */
export function flattenNodeOutputsToAiOutputs(
  orderedNodes: Array<{ nodeId: string; type: WorkflowNodeType | string }>,
  nodeOutputs: NodeOutputMap,
  nodeUserEdits: NodeUserEditMap = {},
): ContentOutputs {
  const out: ContentOutputs = {};
  for (const node of orderedNodes) {
    const layer = mergeNodeLayers(
      nodeOutputs[node.nodeId],
      nodeUserEdits[node.nodeId],
    );
    const t = node.type as WorkflowNodeType;
    switch (t) {
      case WorkflowNodeType.KeywordPlanner:
        if (typeof layer.keywords === 'string') out.keywords = layer.keywords;
        break;
      case WorkflowNodeType.TextGeneration:
        if (typeof layer.text === 'string') out.text = layer.text;
        break;
      case WorkflowNodeType.ImageGeneration:
        if (typeof layer.image === 'string') out.image = layer.image;
        break;
      case WorkflowNodeType.Translation:
        if (typeof layer.translatedText === 'string')
          out.translatedText = layer.translatedText;
        break;
      case WorkflowNodeType.VideoGeneration:
        if (typeof layer.video === 'string') out.video = layer.video;
        break;
      case WorkflowNodeType.Transcription:
        if (typeof layer.transcription === 'string')
          out.transcription = layer.transcription;
        break;
      case WorkflowNodeType.Summarization:
        if (typeof layer.summary === 'string') out.summary = layer.summary;
        break;
      default:
        break;
    }
  }
  return out;
}
