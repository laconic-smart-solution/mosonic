import { WorkflowNodeType } from '../nodes/schemas/workflow-node.schema';
import type { ContentOutputs } from './schemas/content.schema';

/** nodeId → executor output object (e.g. `{ image: "..." }`). */
export type NodeOutputMap = Record<string, Record<string, unknown>>;

/** nodeId → user override fields for that node (same shape as executor slices). */
export type NodeUserEditMap = Record<string, Record<string, unknown>>;

export type PipelineNodeForFlatten = {
  nodeId: string;
  type: WorkflowNodeType | string;
  order?: number;
};

function mergeNodeLayers(
  ai?: Record<string, unknown>,
  user?: Record<string, unknown>,
): Record<string, unknown> {
  return { ...(ai ?? {}), ...(user ?? {}) };
}

function adaptTextFromLayer(layer: Record<string, unknown>): string | undefined {
  if (typeof layer.text === 'string' && layer.text.trim()) {
    return layer.text;
  }
  if (typeof layer.adaptedCaption === 'string' && layer.adaptedCaption.trim()) {
    return layer.adaptedCaption;
  }
  return undefined;
}

function applyLayerToOutputs(
  layer: Record<string, unknown>,
  t: WorkflowNodeType,
  out: ContentOutputs,
): void {
  switch (t) {
    case WorkflowNodeType.KeywordPlanner:
      if (typeof layer.keywords === 'string') out.keywords = layer.keywords;
      break;
    case WorkflowNodeType.TextGeneration: {
      const text = adaptTextFromLayer(layer);
      if (text) out.text = text;
      break;
    }
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
    case WorkflowNodeType.Adapt: {
      const text = adaptTextFromLayer(layer);
      if (text) out.text = text;
      break;
    }
    default:
      break;
  }
}

/**
 * Walk workflow template nodes in order; each node's semantic fields overwrite earlier nodes.
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
    applyLayerToOutputs(layer, node.type as WorkflowNodeType, out);
  }
  return out;
}

/**
 * Walk materialized pipeline nodes (includes lane ids like adapt__instagram).
 */
export function flattenNodeOutputsFromPipeline(
  pipelineNodes: PipelineNodeForFlatten[],
  nodeOutputs: NodeOutputMap,
  nodeUserEdits: NodeUserEditMap = {},
): ContentOutputs {
  const sorted = [...pipelineNodes].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  );
  const out: ContentOutputs = {};
  for (const node of sorted) {
    const layer = mergeNodeLayers(
      nodeOutputs[node.nodeId],
      nodeUserEdits[node.nodeId],
    );
    applyLayerToOutputs(layer, node.type as WorkflowNodeType, out);
  }
  return out;
}

/** Fallback when pipeline template is missing — last-wins scan of all node layers. */
export function flattenNodeOutputsBestEffort(
  nodeOutputs: NodeOutputMap,
  nodeUserEdits: NodeUserEditMap = {},
): ContentOutputs {
  const out: ContentOutputs = {};
  for (const nodeId of Object.keys(nodeOutputs)) {
    const layer = mergeNodeLayers(nodeOutputs[nodeId], nodeUserEdits[nodeId]);
    if (typeof layer.keywords === 'string' && layer.keywords.trim()) {
      out.keywords = layer.keywords;
    }
    const text = adaptTextFromLayer(layer);
    if (text) out.text = text;
    if (typeof layer.image === 'string' && layer.image.trim()) {
      out.image = layer.image;
    }
    if (typeof layer.translatedText === 'string' && layer.translatedText.trim()) {
      out.translatedText = layer.translatedText;
    }
    if (typeof layer.video === 'string' && layer.video.trim()) {
      out.video = layer.video;
    }
    if (typeof layer.transcription === 'string' && layer.transcription.trim()) {
      out.transcription = layer.transcription;
    }
    if (typeof layer.summary === 'string' && layer.summary.trim()) {
      out.summary = layer.summary;
    }
  }
  return out;
}
