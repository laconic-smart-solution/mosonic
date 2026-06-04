import { IntelligenceNodeService } from './intelligence-node.service';
import type { NodeExecutionInput } from '../types/node-execution.types';
import type { Rule } from '../../rule/schemas/rule.schema';

describe('IntelligenceNodeService', () => {
  const rule = {
    brand: {
      brandName: 'Acme',
      industry: 'Tech',
      brandDescription: 'B2B SaaS',
      brandTone: ['professional'],
      brandVoice: 'Clear',
      brandRestrictions: [],
      callToAction: 'Try free',
    },
    audience: {
      description: 'Founders',
      ageRange: { min: 25, max: 55 },
      gender: 'all',
      location: ['US'],
      interests: [],
      painPoints: [],
      language: 'en',
      targetLanguages: ['en'],
    },
    channels: [{ channel: 'linkedin', contentStyle: 'post', priority: 1 }],
    campaign: { goals: [], keywords: [], hashtagStrategy: [] },
    contentGuidelines: {
      dos: [],
      donts: [],
      requiredElements: [],
      seoGuidelines: { primaryKeywords: [] },
    },
  } as unknown as Rule;

  it('returns intelligenceBrief and hints from web search', async () => {
    const llm = {
      runWebSearchBrief: jest.fn().mockResolvedValue({
        text: 'TREND: #ai ...',
        usage: { inputTokens: 100, outputTokens: 200 },
      }),
    };
    const events = { emitToPipeline: jest.fn() };
    const service = new IntelligenceNodeService(
      llm as never,
      events as never,
    );

    const input: NodeExecutionInput = {
      pipelineRef: 'p1',
      workflowRef: 'w1',
      nodeId: 'n1',
      order: 1,
      config: { searchType: 'all', model: 'gpt-4o' },
      rule,
      contentPrompt: 'Launch post',
    };

    const result = await service.execute(input);
    expect(llm.runWebSearchBrief).toHaveBeenCalled();
    const parsed = JSON.parse(result.output ?? '{}') as {
      searchType: string;
      intelligenceBrief: string;
      intelligenceHints: string;
    };
    expect(parsed.searchType).toBe('all');
    expect(parsed.intelligenceBrief).toContain('TREND');
    expect(parsed.intelligenceHints).toBe(parsed.intelligenceBrief);
    expect(result.usage?.outputTokens).toBe(200);
  });
});
