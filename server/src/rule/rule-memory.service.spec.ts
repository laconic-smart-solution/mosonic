import { RuleMemoryService } from './rule-memory.service';
import type { IRuleMemoryRepository } from '../repositories/interfaces/rule-memory.repository.interface';
import type { LlmService } from '../llm/llm.service';
import type { TenancyAuth } from '../auth/tenancy.types';

describe('RuleMemoryService', () => {
  const auth = { userId: 'user-1' } as TenancyAuth;

  function makeService(repoOverrides: Partial<IRuleMemoryRepository> = {}) {
    const memories = {
      create: jest.fn().mockResolvedValue({ ruleMemoryId: 'mem-1' }),
      deleteById: jest.fn().mockResolvedValue(true),
      findByRuleId: jest.fn().mockResolvedValue([]),
      findById: jest.fn(),
      ...repoOverrides,
    } as unknown as IRuleMemoryRepository;
    const llm = {
      embedQuery: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    } as unknown as LlmService;
    return { service: new RuleMemoryService(memories, llm), memories, llm };
  }

  it('embeds the body and persists it on remember', async () => {
    const { service, memories, llm } = makeService();

    await service.remember('rule-1', 'correction', '  Never suggest infographics.  ', auth);

    expect(llm.embedQuery).toHaveBeenCalledWith('Never suggest infographics.');
    expect(memories.create).toHaveBeenCalledWith({
      ruleId: 'rule-1',
      userId: 'user-1',
      type: 'correction',
      body: 'Never suggest infographics.',
      embedding: [0.1, 0.2, 0.3],
    });
  });

  it('still saves the memory when embedding fails', async () => {
    const { service, memories } = makeService();
    (memories as unknown as { create: jest.Mock }).create.mockResolvedValue({});
    const llm = { embedQuery: jest.fn().mockRejectedValue(new Error('down')) } as unknown as LlmService;
    const service2 = new RuleMemoryService(memories, llm);

    await service2.remember('rule-1', 'fact', 'Office closes in December.', auth);

    expect(memories.create).toHaveBeenCalledWith(
      expect.objectContaining({ embedding: undefined }),
    );
  });

  it('throws NotFoundException when forgetting a memory that does not exist', async () => {
    const { service } = makeService({ deleteById: jest.fn().mockResolvedValue(false) });
    await expect(service.forget('missing', auth)).rejects.toThrow(
      'Memory missing not found',
    );
  });

  it('lists recent memories via the repository', async () => {
    const { service, memories } = makeService();
    await service.listRecent('rule-1', auth, 5);
    expect(memories.findByRuleId).toHaveBeenCalledWith('rule-1', auth, 5);
  });
});
