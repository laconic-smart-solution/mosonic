import type {
  ContentOutputs,
  ContentUserEdits,
} from './schemas/content.schema';
import {
  flattenNodeOutputsFromPipeline,
  flattenNodeOutputsToAiOutputs,
  type NodeOutputMap,
  type NodeUserEditMap,
  type PipelineNodeForFlatten,
} from './content-node-output.util';

/** Merged view: user edits override AI outputs when present. */
export type ResolvedContentOutputs = {
  keywords?: string;
  text?: string;
  image?: string;
  translatedText?: string;
  video?: string;
  transcription?: string;
  summary?: string;
};

export type MergeResolvedOptions = {
  /** Workflow template node order (legacy / fallback). */
  workflowNodesOrdered?: Array<{ nodeId: string; type: string }>;
  /** Materialized pipeline nodes — preferred when present with nodeOutputs. */
  pipelineNodesOrdered?: PipelineNodeForFlatten[];
};

export function mergeResolvedOutputs(
  version: {
    outputs?: ContentOutputs;
    userEdits?: ContentUserEdits;
    nodeOutputs?: NodeOutputMap;
    nodeUserEdits?: NodeUserEditMap;
  },
  opts?: MergeResolvedOptions,
): ResolvedContentOutputs {
  const u = version.userEdits ?? {};
  const flatOutputs = version.outputs ?? {};
  const nodeOut = version.nodeOutputs ?? {};
  const nodeUserEdits = version.nodeUserEdits ?? {};
  const hasNodeData = nodeOut && Object.keys(nodeOut).length > 0;

  let flattened: ContentOutputs = {};
  if (hasNodeData && opts?.pipelineNodesOrdered?.length) {
    flattened = flattenNodeOutputsFromPipeline(
      opts.pipelineNodesOrdered,
      nodeOut,
      nodeUserEdits,
    );
  } else if (hasNodeData && opts?.workflowNodesOrdered?.length) {
    flattened = flattenNodeOutputsToAiOutputs(
      opts.workflowNodesOrdered,
      nodeOut,
      nodeUserEdits,
    );
  }

  const o: ContentOutputs =
    hasNodeData &&
    (opts?.pipelineNodesOrdered?.length || opts?.workflowNodesOrdered?.length)
      ? { ...flatOutputs, ...flattened }
      : flatOutputs;

  return {
    keywords: coalesce(u.keywords, o.keywords),
    text: coalesce(u.text, o.text),
    image: coalesce(u.image, o.image),
    translatedText: coalesce(u.translatedText, o.translatedText),
    video: coalesce(u.video, o.video),
    transcription: coalesce(u.transcription, o.transcription),
    summary: coalesce(u.summary, o.summary),
  };
}

function coalesce(
  user: string | undefined | null,
  ai: string | undefined,
): string | undefined {
  if (user !== undefined && user !== null) return user;
  return ai;
}
