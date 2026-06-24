import { WorkflowNodeType } from '../../nodes/schemas/workflow-node.schema';
import type { Rule } from '../../rule/schemas/rule.schema';
import { WorkflowConfigGenerationService } from './workflow-config-generation.service';
import type { LogicalWorkflowNode } from '../workflow-structure.builder';

describe('WorkflowConfigGenerationService', () => {
  const rule = { ruleId: 'r1', name: 'Test Rule' } as Rule;

  const logicalNodes: LogicalWorkflowNode[] = [
    {
      nodeId: 'node-text',
      type: WorkflowNodeType.TextGeneration,
      order: 1,
      isLocked: true,
      targetChannels: ['instagram'],
      config: {},
      userPrompt: '',
    },
  ];

  it('merges AI userPrompt and config by nodeId', async () => {
    const llm = {
      getChatModel: () => ({
        invoke: async () => ({
          content: JSON.stringify({
            'node-text': {
              userPrompt: 'Write a catchy caption',
              config: { tone: 'casual', outputFormat: 'caption' },
            },
          }),
        }),
      }),
    };
    const creditBilling = { recordAndDeduct: jest.fn() };

    const svc = new WorkflowConfigGenerationService(
      llm as never,
      creditBilling as never,
    );

    const out = await svc.generateConfigs(logicalNodes, rule, 'Sale post', {
      userId: 'u1',
      workflowId: 'w1',
    });

    expect(out[0].userPrompt).toBe('Write a catchy caption');
    expect(out[0].config).toMatchObject({
      tone: 'casual',
      outputFormat: 'caption',
    });
    expect(creditBilling.recordAndDeduct).toHaveBeenCalledWith(
      expect.objectContaining({ nodeId: 'workflow-config-generation' }),
    );
  });

  it('returns nodes unchanged when JSON parse fails', async () => {
    const llm = {
      getChatModel: () => ({
        invoke: async () => ({ content: 'not json' }),
      }),
    };
    const creditBilling = { recordAndDeduct: jest.fn() };

    const svc = new WorkflowConfigGenerationService(
      llm as never,
      creditBilling as never,
    );

    const out = await svc.generateConfigs(logicalNodes, rule, 'Hello');
    expect(out[0].nodeId).toBe('node-text');
    expect(out[0].config).toMatchObject({ model: 'gpt-4o' });
  });

  it('drops invalid intelligence searchType from AI and keeps defaults', async () => {
    const intelligenceNodes: LogicalWorkflowNode[] = [
      {
        nodeId: 'node-intel',
        type: WorkflowNodeType.Intelligence,
        order: 1,
        isLocked: false,
        targetChannels: ['instagram'],
        config: { searchType: 'all' },
        userPrompt: '',
      },
    ];

    const llm = {
      getChatModel: () => ({
        invoke: async () => ({
          content: JSON.stringify({
            'node-intel': {
              userPrompt: 'Research latest trends',
              config: { searchType: 'web_search', model: 'gpt-4o' },
            },
          }),
        }),
      }),
    };
    const creditBilling = { recordAndDeduct: jest.fn() };

    const svc = new WorkflowConfigGenerationService(
      llm as never,
      creditBilling as never,
    );

    const out = await svc.generateConfigs(intelligenceNodes, rule, 'Trend post');
    expect(out[0].userPrompt).toBe('Research latest trends');
    expect(out[0].config.searchType).toBe('all');
    expect(out[0].config.model).toBe('gpt-4o');
  });
});
