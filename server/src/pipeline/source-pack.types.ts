/**
 * Run-level source pack: compressed notes for all nodes + classified
 * attachments (especially images) for generate vs edit routing.
 */

export const IMAGE_ASSET_ROLES = [
  'brand_mark',
  'product',
  'identity',
  'style_ref',
  'enhance',
  'context_only',
] as const;

export type ImageAssetRole = (typeof IMAGE_ASSET_ROLES)[number];

/** Roles that feed pixels into gpt-image-2 edit (not context-only). */
export const PIXEL_IMAGE_ROLES: ReadonlySet<ImageAssetRole> = new Set([
  'brand_mark',
  'product',
  'identity',
  'style_ref',
  'enhance',
]);

export type SourcePackAssetKind = 'image' | 'file' | 'url';

export type SourcePackAsset = {
  id: string;
  kind: SourcePackAssetKind;
  label: string;
  /** Stored file URL for images (and optionally other uploads). */
  fileUrl?: string;
  /** File-service relativePath — used when fileUrl is not fetchable. */
  relativePath?: string;
  mime?: string;
  role: ImageAssetRole;
  confidence: number;
};

export type PipelineSourcePack = {
  /** Compressed facts for text-like nodes and image composer context. */
  notes: string;
  assets: SourcePackAsset[];
};

export function emptySourcePack(): PipelineSourcePack {
  return { notes: '', assets: [] };
}

export function parsePipelineSourcePack(
  raw: unknown,
): PipelineSourcePack | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  const notes = typeof obj.notes === 'string' ? obj.notes : '';
  const assetsRaw = Array.isArray(obj.assets) ? obj.assets : [];
  const assets: SourcePackAsset[] = [];
  for (const item of assetsRaw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const a = item as Record<string, unknown>;
    const id = typeof a.id === 'string' ? a.id : '';
    const kind =
      a.kind === 'image' || a.kind === 'file' || a.kind === 'url'
        ? a.kind
        : null;
    const label = typeof a.label === 'string' ? a.label : '';
    const role =
      typeof a.role === 'string' &&
      (IMAGE_ASSET_ROLES as readonly string[]).includes(a.role)
        ? (a.role as ImageAssetRole)
        : 'context_only';
    if (!id || !kind) continue;
    assets.push({
      id,
      kind,
      label: label || id,
      fileUrl: typeof a.fileUrl === 'string' ? a.fileUrl : undefined,
      relativePath:
        typeof a.relativePath === 'string' && a.relativePath.trim()
          ? a.relativePath.trim()
          : undefined,
      mime: typeof a.mime === 'string' ? a.mime : undefined,
      role,
      confidence:
        typeof a.confidence === 'number' && Number.isFinite(a.confidence)
          ? a.confidence
          : 0,
    });
  }
  return { notes, assets };
}

export function pixelAssetsFromPack(
  pack: PipelineSourcePack | null | undefined,
  max = 4,
): SourcePackAsset[] {
  if (!pack?.assets?.length) return [];
  return pack.assets
    .filter(
      (a) =>
        a.kind === 'image' &&
        PIXEL_IMAGE_ROLES.has(a.role) &&
        (!!a.fileUrl?.trim() || !!a.relativePath?.trim()),
    )
    .slice(0, max);
}
