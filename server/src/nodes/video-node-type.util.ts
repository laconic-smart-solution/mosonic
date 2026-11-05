/**
 * Video node types: `video_presenter` (HeyGen talking avatar) and `video_cinematic` (HeyGen cinematic_avatar / heygen_video).
 * `video_generation` is the legacy combined type whose provider came from
 * `config.mode`; it stays readable/executable and is migrated by mode.
 * Mongoose/Nest-free so chat tools, credit and client mirrors can share it.
 */
import { WorkflowNodeType } from './workflow-node-llm.enums';

export type VideoGenerationMode = 'cinematic' | 'presenter';

export const SPLIT_VIDEO_NODE_TYPES = [
  WorkflowNodeType.VideoPresenter,
  WorkflowNodeType.VideoCinematic,
] as const;

/** Split + legacy video types (anything that renders a video). */
export const VIDEO_NODE_TYPES: readonly WorkflowNodeType[] = [
  ...SPLIT_VIDEO_NODE_TYPES,
  WorkflowNodeType.VideoGeneration,
];

const VIDEO_TYPE_SET = new Set<string>(VIDEO_NODE_TYPES);

export function isVideoNodeType(type: unknown): boolean {
  return typeof type === 'string' && VIDEO_TYPE_SET.has(type);
}

export function isLegacyVideoNodeType(type: unknown): boolean {
  return type === WorkflowNodeType.VideoGeneration;
}

function modeFromConfig(config: unknown): VideoGenerationMode {
  const raw =
    config && typeof config === 'object'
      ? (config as { mode?: unknown }).mode
      : undefined;
  return typeof raw === 'string' && raw.trim() === 'presenter'
    ? 'presenter'
    : 'cinematic';
}

/** Mode from the node type; legacy `video_generation` falls back to config.mode. */
export function videoModeForNode(
  type: unknown,
  config?: unknown,
): VideoGenerationMode {
  if (type === WorkflowNodeType.VideoPresenter) return 'presenter';
  if (type === WorkflowNodeType.VideoCinematic) return 'cinematic';
  return modeFromConfig(config);
}

export function videoNodeTypeForMode(
  mode: VideoGenerationMode | string | undefined,
): WorkflowNodeType.VideoPresenter | WorkflowNodeType.VideoCinematic {
  return mode === 'presenter'
    ? WorkflowNodeType.VideoPresenter
    : WorkflowNodeType.VideoCinematic;
}

/**
 * Legacy `video_generation` -> split type by config.mode (default cinematic).
 * Other types pass through unchanged.
 */
export function normalizeVideoNodeType<T extends string>(
  type: T,
  config?: unknown,
): T | WorkflowNodeType.VideoPresenter | WorkflowNodeType.VideoCinematic {
  if (!isLegacyVideoNodeType(type)) return type;
  return videoNodeTypeForMode(modeFromConfig(config));
}

/** Config with `mode` pinned to the node type (keeps old mode-based readers working). */
export function withVideoModeForType<C extends Record<string, unknown>>(
  type: unknown,
  config: C,
): C & { mode?: VideoGenerationMode } {
  if (!isVideoNodeType(type)) return config;
  return { ...config, mode: videoModeForNode(type, config) };
}

/** Upgrade one stored node `{ type, config }` (legacy video only). */
export function migrateLegacyVideoNode<
  N extends { type: string; config?: unknown },
>(node: N): N {
  if (!isLegacyVideoNodeType(node.type)) return node;
  const cfg =
    node.config && typeof node.config === 'object' && !Array.isArray(node.config)
      ? (node.config as Record<string, unknown>)
      : {};
  const type = normalizeVideoNodeType(node.type, cfg);
  return { ...node, type, config: withVideoModeForType(type, cfg) };
}
