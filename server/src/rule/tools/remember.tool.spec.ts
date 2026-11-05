import { createRememberTool } from './remember.tool';
import type { RuleMemoryService } from '../rule-memory.service';
import type { TenancyAuth } from '../../auth/tenancy.types';

describe('createRememberTool', () => {
  const auth = { userId: 'user-1' } as TenancyAuth;

  it('saves the memory via the service and confirms', async () => {
    const ruleMemoryService = {
      remember: jest.fn().mockResolvedValue({ ruleMemoryId: 'mem-1' }),
    } as unknown as RuleMemoryService;
    const chatTool = createRememberTool('rule-1', ruleMemoryService, auth);

    const result = await chatTool.invoke({
      type: 'correction',
      body: 'Never suggest infographics for LinkedIn.',
    });

    expect(ruleMemoryService.remember).toHaveBeenCalledWith(
      'rule-1',
      'correction',
      'Never suggest infographics for LinkedIn.',
      auth,
      [],
    );
    expect(result).toContain('Remembered (correction)');
  });

  it('passes replaceIds so a newer note supersedes the old one', async () => {
    const ruleMemoryService = {
      remember: jest
        .fn()
        .mockResolvedValue({ ruleMemoryId: 'mem-2', replacedIds: ['mem-1'] }),
    } as unknown as RuleMemoryService;
    const result = await createRememberTool('rule-1', ruleMemoryService, auth).invoke({
      type: 'preference',
      body: 'Always use red in images.',
      replaceIds: ['mem-1'],
    });
    expect(ruleMemoryService.remember).toHaveBeenCalledWith(
      'rule-1',
      'preference',
      'Always use red in images.',
      auth,
      ['mem-1'],
    );
    expect(result).toContain('Replaced 1 older note');
  });
});
