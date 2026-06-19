import { filterPipelineNodesForVariant } from './pipeline-variant-filter.util';

describe('filterPipelineNodesForVariant', () => {
  const trunk = { nodeId: 'trunk', variantId: null } as const;
  const controlLane = { nodeId: 'img-ig', variantId: 'control' } as const;
  const variantA = { nodeId: 'img-a', variantId: 'variant_a' } as const;
  const variantB = { nodeId: 'img-b', variantId: 'variant_b' } as const;

  it('keeps trunk and control lane nodes for default finalization', () => {
    const ids = filterPipelineNodesForVariant(
      [trunk, controlLane, variantA, variantB],
      null,
    ).map((n) => n.nodeId);
    expect(ids).toEqual(['trunk', 'img-ig']);
  });

  it('keeps trunk and matching A/B variant lane nodes', () => {
    const ids = filterPipelineNodesForVariant(
      [trunk, controlLane, variantA, variantB],
      'variant_a',
    ).map((n) => n.nodeId);
    expect(ids).toEqual(['trunk', 'img-a']);
  });
});
