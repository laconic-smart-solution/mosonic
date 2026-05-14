import type {
  ContentOutputs,
  ContentUserEdits,
} from './schemas/content.schema';
import {
  flattenNodeOutputsToAiOutputs,
  type NodeOutputMap,
  type NodeUserEditMap,
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
  /** When set with non-empty nodeOutputs, AI base fields are last-wins from nodes then overlaid with flat outputs as fallback. */
  workflowNodesOrdered?: Array<{ nodeId: string; type: string }>;
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
  const hasNodeData =
    opts?.workflowNodesOrdered?.length &&
    nodeOut &&
    Object.keys(nodeOut).length > 0;
  const o: ContentOutputs = hasNodeData
    ? {
        ...flatOutputs,
        ...flattenNodeOutputsToAiOutputs(
          opts!.workflowNodesOrdered!,
          nodeOut,
          version.nodeUserEdits ?? {},
        ),
      }
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
