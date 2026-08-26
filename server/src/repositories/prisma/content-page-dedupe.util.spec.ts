import {
  dedupeContentIndexRows,
  sortContentIndexRows,
} from './content-page-dedupe.util';

describe('content-page-dedupe.util', () => {
  it('keeps the latest createdAt row per pipelineRef + variantId', () => {
    const older = new Date('2024-01-01T00:00:00Z');
    const newer = new Date('2024-06-01T00:00:00Z');
    const out = dedupeContentIndexRows([
      {
        contentId: 'old',
        pipelineRef: 'pipe-1',
        variantId: null,
        createdAt: older,
        updatedAt: older,
      },
      {
        contentId: 'new',
        pipelineRef: 'pipe-1',
        variantId: null,
        createdAt: newer,
        updatedAt: newer,
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.contentId).toBe('new');
  });

  it('preserves distinct A/B variants for the same pipeline', () => {
    const at = new Date('2024-01-01T00:00:00Z');
    const out = dedupeContentIndexRows([
      {
        contentId: 'control',
        pipelineRef: 'pipe-1',
        variantId: null,
        createdAt: at,
        updatedAt: at,
      },
      {
        contentId: 'variant-a',
        pipelineRef: 'pipe-1',
        variantId: 'variant_a',
        createdAt: at,
        updatedAt: at,
      },
    ]);
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.contentId).sort()).toEqual([
      'control',
      'variant-a',
    ]);
  });

  it('sorts deduped rows by updatedAt descending', () => {
    const a = new Date('2024-01-01T00:00:00Z');
    const b = new Date('2024-06-01T00:00:00Z');
    const out = sortContentIndexRows(
      [
        {
          contentId: '1',
          pipelineRef: 'p1',
          variantId: null,
          createdAt: a,
          updatedAt: a,
        },
        {
          contentId: '2',
          pipelineRef: 'p2',
          variantId: null,
          createdAt: b,
          updatedAt: b,
        },
      ],
      'updatedAt',
      'desc',
    );
    expect(out[0]?.contentId).toBe('2');
  });
});
