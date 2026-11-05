import { createForgetTool } from './forget.tool';
import type { RuleMemoryService } from '../rule-memory.service';
import type { TenancyAuth } from '../../auth/tenancy.types';

describe('createForgetTool', () => {
  const auth = { userId: 'user-1' } as TenancyAuth;

  it('deletes the memory and confirms', async () => {
    const ruleMemoryService = {
      forget: jest.fn().mockResolvedValue(undefined),
    } as unknown as RuleMemoryService;
    const chatTool = createForgetTool(ruleMemoryService, auth);

    const result = await chatTool.invoke({ memoryId: 'mem-1' });

    expect(ruleMemoryService.forget).toHaveBeenCalledWith('mem-1', auth);
    expect(result).toBe('Forgotten.');
  });

  it('reports gracefully when the memory does not exist', async () => {
    const ruleMemoryService = {
      forget: jest.fn().mockRejectedValue(new Error('not found')),
    } as unknown as RuleMemoryService;
    const chatTool = createForgetTool(ruleMemoryService, auth);

    const result = await chatTool.invoke({ memoryId: 'missing' });

    expect(result).toContain('No memory found with id missing');
  });
});
