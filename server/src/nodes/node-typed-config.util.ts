/**
 * Typed 1:1 storage for non-video workflow node config (Phase 2).
 * Pure / Nest-free. Mirrors video-node-typed-config.util:
 *  - `workflow_nodes.config` JSON is still dual-written (old readers keep working);
 *  - on read, non-null typed columns overlay the JSON (typed wins);
 *  - a node with no typed row reads its JSON unchanged.
 *
 * One table per type family:
 *  - text        -> workflow_text_node_configs        (text_generation, keyword_planner, summarization, adapt, intelligence)
 *  - translation -> workflow_translation_node_configs (translation)
 *  - image       -> workflow_image_node_configs       (image_generation)
 *  - media       -> workflow_media_node_configs       (transcription, subtitle)
 *  - branch      -> workflow_branch_node_configs      (branch)
 * `merge` has no config; video types live in workflow_video_node_configs.
 */
import {
  hydrateWorkflowNode,
  type TypedVideoConfigRow,
} from './video-node-typed-config.util';

export type TypedFieldKind = 'string' | 'int' | 'float' | 'bool' | 'stringArray';

export type TypedField = { col: string; kind: TypedFieldKind; key?: string };

export type TypedConfigRelation =
  | 'textConfig'
  | 'translationConfig'
  | 'imageConfig'
  | 'mediaConfig'
  | 'branchConfig';

export type TypedConfigDelegate =
  | 'workflowTextNodeConfig'
  | 'workflowTranslationNodeConfig'
  | 'workflowImageNodeConfig'
  | 'workflowMediaNodeConfig'
  | 'workflowBranchNodeConfig';

export type TypedConfigFamily = {
  name: 'text' | 'translation' | 'image' | 'media' | 'branch';
  relation: TypedConfigRelation;
  delegate: TypedConfigDelegate;
  types: readonly string[];
  fields: readonly TypedField[];
};

const s = (col: string): TypedField => ({ col, kind: 'string' });

export const TYPED_CONFIG_FAMILIES: readonly TypedConfigFamily[] = [
  {
    name: 'text',
    relation: 'textConfig',
    delegate: 'workflowTextNodeConfig',
    types: ['text_generation', 'keyword_planner', 'summarization', 'adapt', 'intelligence'],
    fields: [
      s('laneId'),
      s('channel'),
      s('provider'),
      s('model'),
      { col: 'temperature', kind: 'float' },
      { col: 'maxTokens', kind: 'int' },
      s('outputFormat'),
      s('tone'),
      s('textLength'),
      s('summaryLength'),
      s('sourceNodeRef'),
      s('contentStyle'),
      s('searchType'),
      s('customPrompt'),
    ],
  },
  {
    name: 'translation',
    relation: 'translationConfig',
    delegate: 'workflowTranslationNodeConfig',
    types: ['translation'],
    fields: [
      s('laneId'),
      s('provider'),
      s('model'),
      s('sourceLanguage'),
      s('targetLanguage'),
      s('formalityLevel'),
      { col: 'preserveFormatting', kind: 'bool' },
    ],
  },
  {
    name: 'image',
    relation: 'imageConfig',
    delegate: 'workflowImageNodeConfig',
    types: ['image_generation'],
    fields: [
      s('laneId'),
      s('channel'),
      s('provider'),
      s('model'),
      s('size'),
      s('quality'),
      s('style'),
      s('template'),
      s('designStyle'),
      s('aspectRatio'),
      s('negativePrompt'),
    ],
  },
  {
    name: 'media',
    relation: 'mediaConfig',
    delegate: 'workflowMediaNodeConfig',
    types: ['transcription', 'subtitle'],
    fields: [
      s('laneId'),
      s('provider'),
      s('model'),
      s('sourceType'),
      s('language'),
      s('sourceUrl'),
      s('format'),
      { col: 'maxCharsPerLine', kind: 'int' },
      { col: 'burnIn', kind: 'bool' },
      s('sourceText'),
      { col: 'audioDurationSeconds', kind: 'float' },
    ],
  },
  {
    name: 'branch',
    relation: 'branchConfig',
    delegate: 'workflowBranchNodeConfig',
    types: ['branch'],
    fields: [s('mode'), { col: 'channels', kind: 'stringArray' }],
  },
];

/** Prisma `include` for every typed config relation (video included). */
export const TYPED_CONFIG_INCLUDE = {
  videoConfig: true,
  textConfig: true,
  translationConfig: true,
  imageConfig: true,
  mediaConfig: true,
  branchConfig: true,
} as const;

export function typedFamilyForType(type: unknown): TypedConfigFamily | null {
  const t = String(type);
  return TYPED_CONFIG_FAMILIES.find((f) => f.types.includes(t)) ?? null;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function coerce(kind: TypedFieldKind, v: unknown): unknown {
  switch (kind) {
    case 'string':
      return typeof v === 'string' && v.trim() ? v.trim() : null;
    case 'int':
      return typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null;
    case 'float':
      return typeof v === 'number' && Number.isFinite(v) ? v : null;
    case 'bool':
      return typeof v === 'boolean' ? v : null;
    case 'stringArray':
      return Array.isArray(v)
        ? v
            .map((x) => (typeof x === 'string' && x.trim() ? x.trim() : null))
            .filter((x): x is string => Boolean(x))
        : [];
  }
}

/** Typed columns derived from config JSON for the given family. */
export function typedColumnsFromConfig(
  family: TypedConfigFamily,
  config: unknown,
): Record<string, unknown> {
  const c = asRecord(config);
  const out: Record<string, unknown> = {};
  for (const f of family.fields) out[f.col] = coerce(f.kind, c[f.key ?? f.col]);
  return out;
}

/** Typed columns win over JSON; missing typed row = JSON as-is (dual-read). */
export function overlayTypedConfig(
  family: TypedConfigFamily,
  config: unknown,
  row: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const base = { ...asRecord(config) };
  if (!row) return base;
  for (const f of family.fields) {
    const v = row[f.col];
    if (f.kind === 'stringArray') {
      if (Array.isArray(v) && v.length) base[f.key ?? f.col] = [...v];
      continue;
    }
    if (v !== null && v !== undefined && v !== '') base[f.key ?? f.col] = v;
  }
  return base;
}

type TypedRelations = { videoConfig?: TypedVideoConfigRow | null } & Partial<
  Record<TypedConfigRelation, Record<string, unknown> | null>
>;

/** Strip every typed relation and fold the matching one into `config`. */
export function hydrateTypedWorkflowNode<
  T extends { type: unknown; config: unknown } & TypedRelations,
>(node: T): Omit<T, 'videoConfig' | TypedConfigRelation> {
  const rest: Record<string, unknown> = { ...hydrateWorkflowNode(node) };
  const family = typedFamilyForType(node.type);
  for (const f of TYPED_CONFIG_FAMILIES) delete rest[f.relation];
  if (family) {
    const row = node[family.relation];
    if (row) rest.config = overlayTypedConfig(family, node.config, row);
  }
  return rest as Omit<T, 'videoConfig' | TypedConfigRelation>;
}