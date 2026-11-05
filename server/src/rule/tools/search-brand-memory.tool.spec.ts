import { createSearchBrandMemoryTool } from './search-brand-memory.tool';
import type { RuleMemorySearchService } from '../rule-memory-search.service';
import type { TenancyAuth } from '../../auth/tenancy.types';

describe('createSearchBrandMemoryTool', () => {
  const auth = { userId: 'user-1' } as TenancyAuth;

  it('formats matching memories', async () => {
    const ruleMemorySearchService = {
      search: jest.fn().mockResolvedValue([
        { ruleMemoryId: 'mem-1', type: 'fact', body: 'Office closes in December.', score: 0.9 },
      ]),
    } as unknown as RuleMemorySearchService;
    const chatTool = createSearchBrandMemoryTool('rule-1', ruleMemorySearchService, auth);

    const result = await chatTool.invoke({ query: 'december' });

    expect(ruleMemorySearchService.search).toHaveBeenCalledWith('rule-1', 'december', auth);
    expect(result).toBe('[fact, id=mem-1] Office closes in December.');
  });

  it('reports no match found', async () => {
    const ruleMemorySearchService = {
      search: jest.fn().mockResolvedValue([]),
    } as unknown as RuleMemorySearchService;
    const chatTool = createSearchBrandMemoryTool('rule-1', ruleMemorySearchService, auth);

    const result = await chatTool.invoke({ query: 'nothing' });

    expect(result).toBe('No matching memory found.');
  });
});
