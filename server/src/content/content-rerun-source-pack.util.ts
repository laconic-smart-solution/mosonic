import {
  emptySourcePack,
  type PipelineSourcePack,
} from '../pipeline/source-pack.types';

/**
 * Prefer freshly attached assets for this re-run; keep prior notes for context.
 */
export function mergeRerunSourcePack(
  existing: PipelineSourcePack | null | undefined,
  fresh: PipelineSourcePack | null | undefined,
): PipelineSourcePack {
  const base = existing ?? emptySourcePack();
  const next = fresh ?? emptySourcePack();
  const notes = [next.notes, base.notes]
    .map((n) => n.trim())
    .filter(Boolean)
    .join('\n\n');
  return {
    notes,
    assets: next.assets.length > 0 ? next.assets : base.assets,
  };
}
