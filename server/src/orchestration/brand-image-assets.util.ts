import type { RuleAssetRecord } from '../repositories/interfaces/rule-asset.repository.interface';
import {
  emptySourcePack,
  pixelAssetsFromPack,
  type PipelineSourcePack,
  type SourcePackAsset,
} from '../pipeline/source-pack.types';

const MAX_REFERENCE_IMAGES = 2;
const LOGO_NAME_RE = /\b(logo|wordmark|brand\s*mark|lockup)\b/i;

function hasFetchablePixels(asset: RuleAssetRecord): boolean {
  return Boolean(asset.fileUrl?.trim() || asset.relativePath?.trim());
}

export function toImageAsset(
  row: RuleAssetRecord,
  role: SourcePackAsset['role'],
  confidence: number,
): SourcePackAsset {
  return {
    id: row.ruleAssetId,
    kind: 'image',
    label: row.originalFileName || (role === 'brand_mark' ? 'Brand logo' : 'Brand reference image'),
    fileUrl: row.fileUrl?.trim() || undefined,
    relativePath: row.relativePath?.trim() || undefined,
    mime: row.mimeType,
    role,
    confidence,
  };
}

function looksLikeLogo(row: RuleAssetRecord): boolean {
  if (row.type === 'logo') return true;
  if (row.type !== 'reference_image') return false;
  return LOGO_NAME_RE.test(
    `${row.originalFileName ?? ''} ${row.aiDescription ?? ''}`,
  );
}

/**
 * Picks the Rule's ready logo (role `brand_mark`) and up to a couple of
 * ready reference images (role `product`) as source-pack pixel assets.
 * Pure — no I/O, no fetching; the caller supplies already-loaded rows.
 */
export function brandImageAssetsFromRuleAssets(
  ruleAssets: RuleAssetRecord[],
): SourcePackAsset[] {
  const ready = ruleAssets.filter(
    (a) => a.status === 'ready' && hasFetchablePixels(a),
  );
  const typedLogo = ready.find((a) => a.type === 'logo');
  const namedLogo = ready.find((a) => looksLikeLogo(a));
  const logo = typedLogo ?? namedLogo;
  const referenceImages = ready
    .filter((a) => a.type === 'reference_image' && a.ruleAssetId !== logo?.ruleAssetId)
    .slice(0, MAX_REFERENCE_IMAGES);

  const assets: SourcePackAsset[] = [];
  if (logo) {
    assets.push(toImageAsset(logo, 'brand_mark', 1));
  }
  for (const a of referenceImages) {
    assets.push(toImageAsset(a, 'product', 0.8));
  }
  return assets;
}

function isPreviousAsset(asset: SourcePackAsset): boolean {
  return asset.id === 'previous_output' || asset.role === 'enhance';
}

/**
 * Inserts the rule logo immediately after the current photo so
 * pixelAssetsFromPack's 4-image cap cannot drop it.
 */
export function ensureBrandMarkInSourcePack(
  sourcePack: PipelineSourcePack | null | undefined,
  brandAssets: SourcePackAsset[],
): PipelineSourcePack | null | undefined {
  const logo = brandAssets.find((asset) => asset.role === 'brand_mark');
  if (!logo) {
    return mergeBrandAssetsIntoSourcePack(sourcePack, brandAssets);
  }
  const base = sourcePack ?? emptySourcePack();
  const withoutLogo = base.assets.filter(
    (asset) => asset.role !== 'brand_mark' && asset.id !== logo.id,
  );
  const prevIdx = withoutLogo.findIndex(isPreviousAsset);
  const insertAt = prevIdx >= 0 ? prevIdx + 1 : 0;
  return {
    notes: base.notes,
    assets: [
      ...withoutLogo.slice(0, insertAt),
      logo,
      ...withoutLogo.slice(insertAt),
    ],
  };
}

/** Keep-scene edit: Image 1 = current photo, Image 2 = rule logo when requested. */
export function selectKeepScenePixelAssets(
  pack: PipelineSourcePack | null | undefined,
  useBrandLogo: boolean,
): SourcePackAsset[] {
  const pixels = pixelAssetsFromPack(pack, 16);
  const previous = pixels.find(isPreviousAsset);
  if (!previous) return pixels.slice(0, 4);
  if (!useBrandLogo) {
    return [previous, ...pixels.filter((asset) => asset !== previous)].slice(
      0,
      4,
    );
  }
  const logo = pixels.find((asset) => asset.role === 'brand_mark');
  if (!logo) return [previous];
  return [previous, logo];
}

/** Merges brand image assets onto a (possibly empty) source pack without mutating the input. */
export function mergeBrandAssetsIntoSourcePack(
  sourcePack: PipelineSourcePack | null | undefined,
  brandAssets: SourcePackAsset[],
): PipelineSourcePack | null | undefined {
  if (brandAssets.length === 0) return sourcePack;
  return {
    notes: sourcePack?.notes ?? '',
    assets: [...(sourcePack?.assets ?? []), ...brandAssets],
  };
}
