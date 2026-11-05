import { RuleMemorySearchService } from './rule-memory-search.service';
import type { IRuleMemoryRepository } from '../repositories/interfaces/rule-memory.repository.interface';
import type { LlmService } from '../llm/llm.service';
import type { TenancyAuth } from '../auth/tenancy.types';

describe('RuleMemorySearchService.search', () => {
  const auth = { userId: 'user-1' } as TenancyAuth;

  function makeService(
    rows: { ruleMemoryId: string; type: string; body: string; embedding: unknown }[],
    queryEmbedding: number[],
  ) {
    const memories = {
      findByRuleId: jest.fn().mockResolvedValue(
        rows.map((r) => ({ ruleId: 'rule-1', userId: 'user-1', createdAt: new Date(), updatedAt: new Date(), ...r })),
      ),
    } as unknown as IRuleMemoryRepository;
    const llm = {
      embedQuery: jest.fn().mockResolvedValue(queryEmbedding),
    } as unknown as LlmService;
    return new RuleMemorySearchService(memories, llm);
  }

  it('ranks by cosine similarity and respects topK', async () => {
    const service = makeService(
      [
        { ruleMemoryId: 'mem-1', type: 'fact', body: 'close match', embedding: [1, 0] },
        { ruleMemoryId: 'mem-2', type: 'preference', body: 'far match', embedding: [0, 1] },
      ],
      [1, 0],
    );

    const results = await service.search('rule-1', 'query', auth, 1);

    expect(results).toHaveLength(1);
    expect(results[0].ruleMemoryId).toBe('mem-1');
  });

  it('skips rows with no embedding and returns [] if none are embedded', async () => {
    const service = makeService(
      [{ ruleMemoryId: 'mem-1', type: 'fact', body: 'x', embedding: null }],
      [1, 0],
    );

    const results = await service.search('rule-1', 'query', auth);
    expect(results).toEqual([]);
  });
});
