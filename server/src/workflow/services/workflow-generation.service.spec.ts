import { WorkflowGenerationService } from './workflow-generation.service';
import { WorkflowConfigGenerationService } from './workflow-config-generation.service';
import type { WorkflowQAAnswersDto } from '../dto/workflow-qa-answers.dto';
import type { Rule } from '../../rule/schemas/rule.schema';
import { WorkflowNodeType } from '../../nodes/schemas/workflow-node.schema';

describe('WorkflowGenerationService', () => {
  const answers: WorkflowQAAnswersDto = {
    useWebSearch: false,
    useKeywordPlanner: false,
    generateSummary: false,
    summaryChannels: [],
    generateImage: false,
    imageChannels: [],
    generateVideo: false,
    videoChannels: [],
    translate: false,
    translationChannels: [],
    targetLanguages: [],
    additionalMessage: 'Summer promo',
  };

  const rule = {
    ruleId: 'r1',
    name: 'Campaign',
    channels: [
      { channel: 'instagram', priority: 'high', contentStyle: 'visual' },
      { channel: 'facebook', priority: 'medium', contentStyle: 'story' },
    ],
  } as Rule;

  it('orchestrates builder, config gen, and graph adapter', async () => {
    const configured = [
      {
        nodeId: 't1',
        type: WorkflowNodeType.TextGeneration,
        order: 1,
        isLocked: true,
        targetChannels: ['instagram' as const],
        config: { tone: 'casual' },
        userPrompt: 'Write promo copy',
      },
    ];

    const configGen = {
      generateConfigs: jest.fn().mockResolvedValue(configured),
    } as unknown as WorkflowConfigGenerationService;

    const svc = new WorkflowGenerationService(configGen);
    const out = await svc.generate(rule, answers);

    expect(configGen.generateConfigs).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ type: WorkflowNodeType.TextGeneration }),
      ]),
      rule,
      'Summer promo',
    );
    expect(out.map((n) => n.type)).toEqual([
      WorkflowNodeType.TextGeneration,
      WorkflowNodeType.Branch,
      WorkflowNodeType.Adapt,
      WorkflowNodeType.Merge,
    ]);
    expect(out[0].userPrompt).toBe('Write promo copy');
  });

  it('buildDefaultStructure skips LLM and returns fixed preset graph', () => {
    const configGen = {
      generateConfigs: jest.fn(),
    } as unknown as WorkflowConfigGenerationService;

    const svc = new WorkflowGenerationService(configGen);
    const out = svc.buildDefaultStructure(rule);

    expect(configGen.generateConfigs).not.toHaveBeenCalled();
    expect(out.map((n) => n.type)).toEqual([
      WorkflowNodeType.KeywordPlanner,
      WorkflowNodeType.Intelligence,
      WorkflowNodeType.TextGeneration,
      WorkflowNodeType.Branch,
      WorkflowNodeType.Adapt,
      WorkflowNodeType.Merge,
    ]);
  });
});
