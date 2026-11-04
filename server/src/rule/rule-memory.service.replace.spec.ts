import { RuleMemoryService } from './rule-memory.service';
import type { TenancyAuth } from '../auth/tenancy.types';

describe('RuleMemoryService replace / forgetAll', () => {
  const auth = { userId: 'user-1' } as TenancyAuth;

  function setup(records: { ruleMemoryId: string; ruleId: string }[]) {
    const store = new Map(records.map((r) => [r.ruleMemoryId, r]));
    const repo = {
      findById: jest.fn(async (id: string) => store.get(id) ?? null),
      findByRuleId: jest.fn(async (ruleId: string) =>
        [...store.values()].filter((r) => r.ruleId === ruleId),
      ),
      create: jest.fn(async (data: { body: string }) => ({ ruleMemoryId: 'new', ...data })),
      deleteById: jest.fn(async (id: string) => store.delete(id)),
    };
    const llm = { embedQuery: jest.fn().mockResolvedValue(null) };
    const service = new RuleMemoryService(repo as never, llm as never);
    return { service, repo, store };
  }

  it('removes only same-brand notes listed in replaceIds', async () => {
    const { service, store } = setup([
      { ruleMemoryId: 'a', ruleId: 'rule-1' },
      { ruleMemoryId: 'b', ruleId: 'rule-2' },
    ]);
    const saved = await service.remember('rule-1', 'preference', 'x', auth, ['a', 'b', 'missing']);
    expect(saved.replacedIds).toEqual(['a']);
    expect(store.has('a')).toBe(false);
    expect(store.has('b')).toBe(true);
  });

  it('forgetAll clears every note for the brand in one call', async () => {
    const { service, store } = setup([
      { ruleMemoryId: 'a', ruleId: 'rule-1' },
      { ruleMemoryId: 'b', ruleId: 'rule-1' },
      { ruleMemoryId: 'c', ruleId: 'rule-2' },
    ]);
    await expect(service.forgetAll('rule-1', auth)).resolves.toBe(2);
    expect([...store.keys()]).toEqual(['c']);
  });
});
