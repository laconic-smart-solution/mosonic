import { cosineSimilarity, RuleAssetSearchService } from './rule-asset-search.service';
import type { LlmService } from '../llm/llm.service';
import type { IRuleAssetRepository } from '../repositories/interfaces/rule-asset.repository.interface';

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it('returns -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  it('returns 0 when either vector is all zeros', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe('RuleAssetSearchService.search', () => {
  function makeService(
    chunks: { ruleAssetId: string; chunkIndex: number; text: string; embedding: unknown }[],
    queryEmbedding: number[],
  ) {
    const ruleAssets = {
      findChunksByRuleId: jest.fn().mockResolvedValue(
        chunks.map((c, i) => ({
          ruleAssetChunkId: `chunk-${i}`,
          createdAt: new Date(),
          ...c,
        })),
      ),
    } as unknown as IRuleAssetRepository;
    const llm = {
      embedQuery: jest.fn().mockResolvedValue(queryEmbedding),
    } as unknown as LlmService;
    return new RuleAssetSearchService(ruleAssets, llm);
  }

  it('returns chunks ranked by similarity, limited to topK', async () => {
    const service = makeService(
      [
        { ruleAssetId: 'a1', chunkIndex: 0, text: 'far', embedding: [0, 1] },
        { ruleAssetId: 'a1', chunkIndex: 1, text: 'near', embedding: [1, 0] },
      ],
      [1, 0],
    );

    const results = await service.search('rule-1', 'query', 1);

    expect(results).toHaveLength(1);
    expect(results[0].text).toBe('near');
  });

  it('returns an empty array when the rule has no chunks', async () => {
    const service = makeService([], [1, 0]);
    const results = await service.search('rule-1', 'query');
    expect(results).toEqual([]);
  });

  it('skips chunks whose embedding is not an array', async () => {
    const service = makeService(
      [
        { ruleAssetId: 'a1', chunkIndex: 0, text: 'bad', embedding: null },
        { ruleAssetId: 'a1', chunkIndex: 1, text: 'good', embedding: [1, 0] },
      ],
      [1, 0],
    );

    const results = await service.search('rule-1', 'query');

    expect(results).toHaveLength(1);
    expect(results[0].text).toBe('good');
  });
});
