/**
 * Typed 1:1 storage for video_cinematic / video_presenter node config
 * (`workflow_video_node_configs`). Pure / Nest-free.
 *
 * Transition (Phase 1): `workflow_nodes.config` JSON is still dual-written, so
 * old readers keep working. On read, non-null typed columns overlay the JSON
 * (typed wins); a node with no typed row reads its JSON unchanged.
 */

export const TYPED_VIDEO_NODE_TYPES = ['video_cinematic', 'video_presenter'] as const;

export function isTypedVideoNodeType(type: unknown): boolean {
  return (TYPED_VIDEO_NODE_TYPES as readonly string[]).includes(String(type));
}

export const PRESENTER_TYPED_KEYS = [
  'heygenOrientation',
  'heygenExpressiveness',
  'heygenMotionPrompt',
  'heygenBackgroundAssetId',
  'heygenBackgroundUrl',
  'removeBackground',
  'heygenAvatarAssetId',
  'heygenAvatarPhotoUrl',
  'resolution',
] as const;
export type PresenterTypedKey = (typeof PRESENTER_TYPED_KEYS)[number];

/** Columns derived from config JSON (FK columns are resolved by the repository). */
export type TypedVideoConfigColumns = {
  mode: string | null;
  cinematicMode: string | null;
  heygenVideoMode: string | null;
  duration: number | null;
  aspectRatio: string | null;
  heygenVoiceId: string | null;
  heygenAvatarId: string | null;
  heygenAvatarIds: string[];
  heygenCinematicModel: string | null;
  /** Presenter-only (Avatar IV / photo avatar). */
  heygenOrientation: string | null;
  heygenExpressiveness: string | null;
  heygenMotionPrompt: string | null;
  heygenBackgroundAssetId: string | null;
  heygenBackgroundUrl: string | null;
  removeBackground: boolean | null;
  heygenAvatarAssetId: string | null;
  heygenAvatarPhotoUrl: string | null;
  resolution: string | null;
  /** Requested brand asset binding (validated before it becomes an FK). */
  sourceRuleAssetId: string | null;
};

export type TypedVideoConfigRow = Omit<
  TypedVideoConfigColumns,
  'sourceRuleAssetId' | PresenterTypedKey
> &
  Partial<Pick<TypedVideoConfigColumns, PresenterTypedKey>> & {
  sourceRuleAssetId?: string | null;
  userAvatarLookId?: string | null;
};

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

export function typedVideoColumnsFromConfig(config: unknown): TypedVideoConfigColumns {
  const c = asRecord(config);
  const duration =
    typeof c.duration === 'number' && Number.isFinite(c.duration)
      ? Math.round(c.duration)
      : null;
  const ids = Array.isArray(c.heygenAvatarIds)
    ? c.heygenAvatarIds.map(str).filter((x): x is string => Boolean(x))
    : [];
  return {
    mode: str(c.mode),
    cinematicMode: str(c.cinematicMode),
    heygenVideoMode: str(c.heygenVideoMode),
    duration,
    aspectRatio: str(c.aspectRatio),
    heygenVoiceId: str(c.heygenVoiceId),
    heygenAvatarId: str(c.heygenAvatarId),
    heygenAvatarIds: ids.slice(0, 3),
    heygenCinematicModel: str(c.heygenCinematicModel),
    heygenOrientation: str(c.heygenOrientation),
    heygenExpressiveness: str(c.heygenExpressiveness),
    heygenMotionPrompt: str(c.heygenMotionPrompt),
    heygenBackgroundAssetId: str(c.heygenBackgroundAssetId),
    heygenBackgroundUrl: str(c.heygenBackgroundUrl),
    removeBackground: typeof c.removeBackground === 'boolean' ? c.removeBackground : null,
    heygenAvatarAssetId: str(c.heygenAvatarAssetId),
    heygenAvatarPhotoUrl: str(c.heygenAvatarPhotoUrl),
    resolution: str(c.resolution),
    sourceRuleAssetId: str(c.heygenLookSourceRuleAssetId),
  };
}

/** Typed columns win over JSON; missing typed row = JSON as-is (dual-read). */
export function overlayTypedVideoConfig(
  config: unknown,
  row: TypedVideoConfigRow | null | undefined,
): Record<string, unknown> {
  const base = { ...asRecord(config) };
  if (!row) return base;
  const scalar: Array<[keyof TypedVideoConfigRow, string]> = [
    ['mode', 'mode'],
    ['cinematicMode', 'cinematicMode'],
    ['heygenVideoMode', 'heygenVideoMode'],
    ['duration', 'duration'],
    ['aspectRatio', 'aspectRatio'],
    ['heygenVoiceId', 'heygenVoiceId'],
    ['heygenAvatarId', 'heygenAvatarId'],
    ['heygenCinematicModel', 'heygenCinematicModel'],
    ['sourceRuleAssetId', 'heygenLookSourceRuleAssetId'],
    ...PRESENTER_TYPED_KEYS.map((k) => [k, k] as [keyof TypedVideoConfigRow, string]),
  ];
  for (const [col, key] of scalar) {
    const v = row[col];
    if (v !== null && v !== undefined && v !== '') base[key] = v;
  }
  if (Array.isArray(row.heygenAvatarIds) && row.heygenAvatarIds.length) {
    base.heygenAvatarIds = [...row.heygenAvatarIds];
  }
  return base;
}

/** Strip the Prisma relation and fold typed columns into `config`. */
export function hydrateWorkflowNode<
  T extends { type: unknown; config: unknown; videoConfig?: TypedVideoConfigRow | null },
>(node: T): Omit<T, 'videoConfig'> {
  const { videoConfig, ...rest } = node;
  if (!isTypedVideoNodeType(node.type) || !videoConfig) {
    return rest as Omit<T, 'videoConfig'>;
  }
  return {
    ...rest,
    config: overlayTypedVideoConfig(node.config, videoConfig),
  } as Omit<T, 'videoConfig'>;
}
