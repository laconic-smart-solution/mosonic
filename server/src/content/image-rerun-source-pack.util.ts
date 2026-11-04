import {
  emptySourcePack,
  pixelAssetsFromPack,
  type PipelineSourcePack,
  type SourcePackAsset,
} from '../pipeline/source-pack.types';

const PREVIOUS_OUTPUT_ID = 'previous_output';

/**
 * User explicitly wants a fresh image, not an edit of the last one — an
 * edit anchors to the old photo's layout/subject, so a real redesign
 * ("editorial design", "magazine layout") needs a clean generate instead.
 */
export function isImageRerunStartFresh(message: string): boolean {
  return /\b(start\s+over|completely\s+different|brand\s+new|from\s+scratch|new\s+concept|totally\s+different|try\s+again\s+from\s+scratch|recreate|redesign|reimagine|re-?imagine|new\s+(layout|design|style|concept|direction)|different\s+(layout|design|style)|redo\s+(it\s+)?completely)\b/i.test(
    message.trim(),
  );
}

export type ResolveImageRerunSourcePackInput = {
  sourcePack?: PipelineSourcePack | null;
  previousImageUrl?: string | null;
  /** Follow-up typed in the re-run dialog (not the original pipeline prompt). */
  rerunMessage?: string | null;
  /** True when this re-run request included new files/URLs. */
  hadNewAttachments?: boolean;
};

/**
 * Decide whether to feed the previous generated image into images.edit.
 *
 * - Empty message, no new attachments → leave pack alone (fresh generate).
 * - Non-empty tweak message → previous as enhance (Image 1).
 * - New attachments → keep those first; append previous if under the pixel cap.
 * - "start over" / similar → never inject previous.
 */
export function resolveImageRerunSourcePack(
  input: ResolveImageRerunSourcePackInput,
): PipelineSourcePack {
  const base = input.sourcePack ?? emptySourcePack();
  const prev = input.previousImageUrl?.trim() || '';
  if (!prev) return base;

  const message = input.rerunMessage?.trim() ?? '';
  if (isImageRerunStartFresh(message)) return base;

  const hadNewAttachments = input.hadNewAttachments === true;
  if (!message && !hadNewAttachments) return base;

  if (base.assets.some((a) => a.id === PREVIOUS_OUTPUT_ID || a.fileUrl === prev)) {
    return base;
  }

  const prevAsset: SourcePackAsset = {
    id: PREVIOUS_OUTPUT_ID,
    kind: 'image',
    label: 'previous_output',
    fileUrl: prev,
    role: 'enhance',
    confidence: 1,
  };

  if (hadNewAttachments) {
    const pixelCount = pixelAssetsFromPack(base).length;
    if (pixelCount >= 4) return base;
    return {
      notes: base.notes,
      assets: [...base.assets, prevAsset],
    };
  }

  // Tweak-style message: previous first so edit targets the current creative.
  return {
    notes: base.notes,
    assets: [prevAsset, ...base.assets],
  };
}

/** Keep-scene edit: current photo is always Image 1, even if the message says redesign. */
export function forcePreviousImageFirst(
  sourcePack: PipelineSourcePack | null | undefined,
  previousImageUrl: string,
): PipelineSourcePack {
  const base = sourcePack ?? emptySourcePack();
  const prev = previousImageUrl.trim();
  const withoutPrev = base.assets.filter(
    (asset) => asset.id !== PREVIOUS_OUTPUT_ID && asset.fileUrl !== prev,
  );
  const prevAsset: SourcePackAsset = {
    id: PREVIOUS_OUTPUT_ID,
    kind: 'image',
    label: 'previous_output',
    fileUrl: prev,
    role: 'enhance',
    confidence: 1,
  };
  return {
    notes: base.notes,
    assets: [prevAsset, ...withoutPrev],
  };
}
