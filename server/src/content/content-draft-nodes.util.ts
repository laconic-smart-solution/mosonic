import { stripMaterializedNodeSuffix } from './content-rerun-node-resolve.util';
import { normalizeLaneId } from '../workflow/workflow-graph.util';

export const NODE_PREVIEW_LIMIT = 2000;

const TEXT_TYPES = new Set([
  'text_generation',
  'adapt',
  'translation',
  'summarization',
]);

export type DraftNodeView = {
  nodeId: string;
  type: string;
  lane: string | null;
  field: string;
  preview: string;
  pending: boolean;
};

export type DraftNodeCatalog = {
  lanes: string[];
  nodes: DraftNodeView[];
};

type CatalogNode = {
  nodeId: string;
  type: string;
  order?: number;
  lane?: string | null;
  config?: unknown;
  isGenerateMoreOnly?: boolean;
};

function fieldForType(type: string): string | null {
  switch (type) {
    case 'text_generation':
    case 'adapt':
      return 'text';
    case 'translation':
      return 'translatedText';
    case 'summarization':
      return 'summary';
    case 'keyword_planner':
      return 'keywords';
    case 'image_generation':
      return 'image';
    case 'video_presenter':
    case 'video_cinematic':
    case 'video_generation':
      return 'video';
    case 'transcription':
      return 'transcription';
    default:
      return null;
  }
}

function readLane(node: CatalogNode, knownLanes: string[]): string | null {
  if (typeof node.lane === 'string' && node.lane.trim()) {
    return normalizeLaneId(node.lane);
  }
  const config = node.config as { laneId?: unknown; channel?: unknown } | undefined;
  if (typeof config?.laneId === 'string' && config.laneId.trim()) {
    return normalizeLaneId(config.laneId);
  }
  if (typeof config?.channel === 'string' && config.channel.trim()) {
    return normalizeLaneId(config.channel);
  }
  return stripMaterializedNodeSuffix(node.nodeId, knownLanes).lane;
}

function collectKnownLanes(nodes: CatalogNode[]): string[] {
  const lanes = new Set<string>();
  for (const node of nodes) {
    if (typeof node.lane === 'string' && node.lane.trim()) {
      lanes.add(normalizeLaneId(node.lane));
    }
    const stripped = stripMaterializedNodeSuffix(node.nodeId, []);
    if (stripped.lane) lanes.add(stripped.lane);
  }
  return [...lanes];
}

function layerValue(
  nodeOutputs: Record<string, Record<string, unknown>>,
  nodeUserEdits: Record<string, Record<string, unknown>>,
  nodeId: string,
): Record<string, unknown> {
  return {
    ...(nodeOutputs[nodeId] ?? {}),
    ...(nodeUserEdits[nodeId] ?? {}),
  };
}

function previewOf(value: unknown): string {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (text.length <= NODE_PREVIEW_LIMIT) return text;
  return `${text.slice(0, NODE_PREVIEW_LIMIT)}…`;
}

export function buildDraftNodeCatalog(input: {
  workflowNodes: CatalogNode[];
  pipelineNodes?: CatalogNode[];
  nodeOutputs: Record<string, Record<string, unknown>>;
  nodeUserEdits?: Record<string, Record<string, unknown>>;
}): DraftNodeCatalog {
  const edits = input.nodeUserEdits ?? {};
  const knownLanes = collectKnownLanes([
    ...input.workflowNodes,
    ...(input.pipelineNodes ?? []),
  ]);
  const byWorkflowId = new Map(
    input.workflowNodes.map((node) => [node.nodeId, node]),
  );

  const ordered: CatalogNode[] = [];
  const seen = new Set<string>();
  const push = (node: CatalogNode) => {
    if (!node.nodeId || seen.has(node.nodeId)) return;
    seen.add(node.nodeId);
    ordered.push(node);
  };

  const pipeline = [...(input.pipelineNodes ?? [])].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  );
  if (pipeline.length > 0) {
    for (const node of pipeline) push(node);
  } else {
    for (const node of [...input.workflowNodes].sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0),
    )) {
      push(node);
    }
  }

  for (const node of input.workflowNodes) {
    if (node.isGenerateMoreOnly) push(node);
  }

  for (const nodeId of Object.keys(input.nodeOutputs)) {
    if (seen.has(nodeId)) continue;
    const workflow =
      byWorkflowId.get(nodeId) ??
      byWorkflowId.get(stripMaterializedNodeSuffix(nodeId, knownLanes).baseId);
    if (!workflow) continue;
    push({
      nodeId,
      type: workflow.type,
      order: workflow.order,
      lane: readLane({ ...workflow, nodeId }, knownLanes),
      config: workflow.config,
      isGenerateMoreOnly: workflow.isGenerateMoreOnly,
    });
  }

  const nodes: DraftNodeView[] = [];
  for (const node of ordered) {
    const field = fieldForType(String(node.type));
    if (!field) continue;
    const layer = layerValue(input.nodeOutputs, edits, node.nodeId);
    const pending = layer._pending === true;
    const preview = previewOf(layer[field]);
    if (!preview && !pending) continue;
    nodes.push({
      nodeId: node.nodeId,
      type: String(node.type),
      lane: readLane(node, knownLanes),
      field,
      preview,
      pending,
    });
  }

  const lanes = [
    ...new Set(
      nodes
        .filter((node) => TEXT_TYPES.has(node.type) && node.lane)
        .map((node) => node.lane as string),
    ),
  ];

  return { lanes, nodes };
}

export function textNodes(nodes: DraftNodeView[]): DraftNodeView[] {
  return nodes.filter((node) => TEXT_TYPES.has(node.type));
}

export function imageNodes(nodes: DraftNodeView[]): DraftNodeView[] {
  return nodes.filter((node) => node.type === 'image_generation');
}

function nodeLabel(node: DraftNodeView): string {
  const lane = node.lane ? node.lane : 'Shared';
  return `${lane} ${node.field}`;
}

export type DraftNodeResolution =
  | { kind: 'one'; node: DraftNodeView }
  | { kind: 'many'; nodes: DraftNodeView[] }
  | {
      kind: 'ask';
      question: string;
      options: { id: string; label: string }[];
    }
  | { kind: 'not_found' };

const TYPE_WORDS: Record<string, 'image' | 'text'> = {
  image: 'image',
  images: 'image',
  photo: 'image',
  picture: 'image',
  image_generation: 'image',
  text: 'text',
  caption: 'text',
  copy: 'text',
  text_generation: 'text',
  adapt: 'text',
  translation: 'text',
  summary: 'text',
};

/**
 * Pick a generated node on this draft. Several matches become an ask_user
 * payload instead of a guess. `all` reruns every text-like node.
 */
export function resolveDraftNodeTarget(
  requested: string,
  nodes: DraftNodeView[],
): DraftNodeResolution {
  const trimmed = requested.trim();
  if (!trimmed) return { kind: 'not_found' };

  if (trimmed.toLowerCase() === 'all') {
    const targets = textNodes(nodes);
    if (targets.length === 0) return { kind: 'not_found' };
    return { kind: 'many', nodes: targets };
  }

  const exact = nodes.find((node) => node.nodeId === trimmed);
  if (exact) return { kind: 'one', node: exact };

  const word = TYPE_WORDS[trimmed.toLowerCase().replace(/[\s-]+/g, '_')];
  if (!word) return { kind: 'not_found' };

  const matches = word === 'image' ? imageNodes(nodes) : textNodes(nodes);
  if (matches.length === 0) return { kind: 'not_found' };
  if (matches.length === 1) return { kind: 'one', node: matches[0] };

  const options = matches.map((node) => ({
    id: node.nodeId,
    label: nodeLabel(node),
  }));
  if (word === 'text') {
    options.push({ id: 'all', label: 'All channels' });
  }
  return {
    kind: 'ask',
    question:
      word === 'image'
        ? 'Which image should I edit?'
        : 'Which channel should I update?',
    options,
  };
}

function stringFields(
  output: Record<string, unknown>,
): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(output)) {
    if (key.startsWith('_') || typeof value !== 'string') continue;
    fields[key] = value;
  }
  return fields;
}

export function laneFromNodeOutput(
  nodeId: string,
  output: Record<string, unknown>,
  knownLanes: string[] = [],
  pipelineLane?: string | null,
): string | null {
  if (typeof pipelineLane === 'string' && pipelineLane.trim()) {
    return normalizeLaneId(pipelineLane);
  }
  if (typeof output.channel === 'string' && output.channel.trim()) {
    return normalizeLaneId(output.channel);
  }
  return stripMaterializedNodeSuffix(nodeId, knownLanes).lane;
}

/**
 * Copy a node executor output onto every layer the content page and
 * channel tabs read: nodeOutputs, nodeUserEdits, flat userEdits, and
 * laneOutputs[channel].
 */
export function applyNodeOutputToDraft(args: {
  nodeId: string;
  output: Record<string, unknown>;
  userEdits: Record<string, unknown>;
  nodeUserEdits: Record<string, Record<string, unknown>>;
  nodeOutputs: Record<string, Record<string, unknown>>;
  laneOutputs?: Record<string, Record<string, unknown>>;
  lane?: string | null;
  aliasNodeIds?: string[];
}): {
  userEdits: Record<string, unknown>;
  nodeUserEdits: Record<string, Record<string, unknown>>;
  nodeOutputs: Record<string, Record<string, unknown>>;
  laneOutputs: Record<string, Record<string, unknown>>;
} {
  const fields = stringFields(args.output);
  const ids = [
    ...new Set(
      [args.nodeId, ...(args.aliasNodeIds ?? [])].filter(
        (id) => typeof id === 'string' && id.trim(),
      ),
    ),
  ];
  const nodeOutputs = { ...args.nodeOutputs };
  const nodeUserEdits = { ...args.nodeUserEdits };
  const flat = { ...args.userEdits };
  for (const id of ids) {
    const nextOutput = { ...(nodeOutputs[id] ?? {}) };
    delete nextOutput._pending;
    nodeOutputs[id] = { ...nextOutput, ...fields };
    const nextEdit = { ...(nodeUserEdits[id] ?? {}) };
    delete nextEdit._pending;
    nodeUserEdits[id] = { ...nextEdit, ...fields };
  }
  Object.assign(flat, fields);

  const laneOutputs = { ...(args.laneOutputs ?? {}) };
  const lane = args.lane?.trim() ? normalizeLaneId(args.lane) : null;
  if (lane) {
    const nextLane = { ...(laneOutputs[lane] ?? {}) };
    delete nextLane._pending;
    laneOutputs[lane] = { ...nextLane, ...fields };
  }

  return { userEdits: flat, nodeUserEdits, nodeOutputs, laneOutputs };
}

/** Copy a node executor output onto the layers the content page reads. */
export function copyNodeOutputIntoEdits(args: {
  nodeId: string;
  output: Record<string, unknown>;
  userEdits: Record<string, unknown>;
  nodeUserEdits: Record<string, Record<string, unknown>>;
}): {
  userEdits: Record<string, unknown>;
  nodeUserEdits: Record<string, Record<string, unknown>>;
} {
  const copied = applyNodeOutputToDraft({
    ...args,
    nodeOutputs: {},
  });
  return {
    userEdits: copied.userEdits,
    nodeUserEdits: copied.nodeUserEdits,
  };
}
