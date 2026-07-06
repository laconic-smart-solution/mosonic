import type { ContentStatus } from '@prisma/client';

export type ContentIndexRow = {
  contentId: string;
  pipelineRef: string;
  variantId: string | null;
  createdAt: Date;
  updatedAt: Date;
  status?: ContentStatus;
};

export function contentVariantDedupeKey(row: {
  pipelineRef: string;
  variantId?: string | null;
}): string {
  return `${row.pipelineRef}\0${row.variantId ?? ''}`;
}

export function dedupeContentIndexRows(rows: ContentIndexRow[]): ContentIndexRow[] {
  const byKey = new Map<string, ContentIndexRow>();
  for (const row of rows) {
    const key = contentVariantDedupeKey(row);
    const prev = byKey.get(key);
    if (!prev || row.createdAt > prev.createdAt) {
      byKey.set(key, row);
    }
  }
  return [...byKey.values()];
}

export function sortContentIndexRows(
  rows: ContentIndexRow[],
  sortBy: 'createdAt' | 'updatedAt',
  sortOrder: 'asc' | 'desc',
): ContentIndexRow[] {
  const dir = sortOrder === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[sortBy].getTime();
    const bv = b[sortBy].getTime();
    if (av !== bv) return (av - bv) * dir;
    return a.contentId.localeCompare(b.contentId) * dir;
  });
}
