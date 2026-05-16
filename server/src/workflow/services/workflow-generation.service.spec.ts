import { Logger } from '@nestjs/common';
import {
  ChannelPriority,
  GenderOption,
  OriginalInputType,
  PostingFrequency,
  RuleStatus,
} from '../../rule/schemas/rule.schema';
import type { Rule } from '../../rule/schemas/rule.schema';
import { LlmService } from '../../llm/llm.service';
import { WorkflowNodeType } from '../../nodes/schemas/workflow-node.schema';
import {
  WorkflowGenerationService,
  generateFallbackWorkflowNodes,
  inferContentPromptHints,
  normalizeWorkflowAiNodes,
} from './workflow-generation.service';

function minimalRule(channel: string): Rule {
  return {
    ruleId: 'rule-test-1',
    name: 'Fixture',
    brand: {
      brandName: 'Acme',
      industry: 'Tech',
      brandDescription: 'Widgets',
      brandTone: ['friendly'],
      brandVoice: 'We',
      brandRestrictions: [],
      callToAction: 'Buy',
    },
    audience: {
      description: 'Pros',
      ageRange: { min: 25, max: 45 },
      gender: GenderOption.All,
      location: ['US'],
      interests: [],
      painPoints: [],
      language: 'en',
      targetLanguages: [],
    },
    campaign: {
      goals: [],
      keywords: [],
      hashtagStrategy: [],
      contentFormats: ['caption'],
      duration: {
        startDate: new Date(),
        endDate: new Date(),
      },
      postingFrequency: PostingFrequency.Weekly,
      customSchedule: [],
    },
    channels: [
      {
        channel,
        priority: ChannelPriority.High,
        contentStyle: 'casual',
      },
    ],
    contentGuidelines: {
      dos: [],
      donts: [],
      requiredElements: [],
      seoGuidelines: {
        primaryKeywords: [],
        secondaryKeywords: [],
        keywordDensity: 'low',
      },
    },
    originalInput: {
      type: OriginalInputType.Text,
      storedAt: new Date().toISOString(),
    },
    status: RuleStatus.Active,
    versions: [],
  } as Rule;
}

describe('WorkflowGenerationService', () => {
  it('inferContentPromptHints detects video and carousel', () => {
    expect(inferContentPromptHints('15s TikTok reel about coffee').wantsVideo).toBe(
      true,
    );
    expect(
      inferContentPromptHints('Instagram carousel with 5 product shots')
        .wantsCarousel,
    ).toBe(true);
  });

  it('fallback differs for reel vs carousel on same Instagram rule', () => {
    const rule = minimalRule('instagram');
    const reel = generateFallbackWorkflowNodes(
      rule,
      'vertical TikTok reel for summer sale',
    );
    const carousel = generateFallbackWorkflowNodes(
      rule,
      'Instagram carousel for product launch',
    );
    const reelTypes = reel.map((n) => n.type);
    const carouselTypes = carousel.map((n) => n.type);
    expect(reelTypes).toContain(WorkflowNodeType.VideoGeneration);
    expect(reelTypes).not.toContain(WorkflowNodeType.ImageGeneration);
    expect(carouselTypes).toContain(WorkflowNodeType.ImageGeneration);
    expect(carouselTypes).not.toContain(WorkflowNodeType.VideoGeneration);
  });

  it('normalizeWorkflowAiNodes salvages duplicate planners and keeps first text node', () => {
    const rule = minimalRule('instagram');
    const logger = { warn: jest.fn() } as unknown as Logger;
    const raw = [
      {
        type: 'keyword_planner',
        order: 1,
        config: {},
      },
      {
        type: 'keyword_planner',
        order: 2,
        config: {},
      },
      {
        type: 'text_generation',
        order: 3,
        config: { outputFormat: 'caption', tone: 'friendly' },
      },
      {
        type: 'image_generation',
        order: 4,
        config: { aspectRatio: '1:1' },
      },
    ];
    const out = normalizeWorkflowAiNodes(raw, rule, 'test', logger);
    expect(out.filter((n) => n.type === WorkflowNodeType.KeywordPlanner)).toHaveLength(
      1,
    );
    expect(out.filter((n) => n.type === WorkflowNodeType.TextGeneration)).toHaveLength(
      1,
    );
    expect(out[out.length - 1]?.type).toBe(WorkflowNodeType.ImageGeneration);
  });

  it('normalizeWorkflowAiNodes falls back when no text_generation', () => {
    const rule = minimalRule('instagram');
    const logger = { warn: jest.fn() } as unknown as Logger;
    const out = normalizeWorkflowAiNodes(
      [{ type: 'keyword_planner', order: 1, config: {} }],
      rule,
      'solo planner',
      logger,
    );
    expect(out.some((n) => n.type === WorkflowNodeType.TextGeneration)).toBe(true);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('generate uses LLM and returns normalized nodes', async () => {
    const invoke = jest.fn().mockResolvedValue({
      content: JSON.stringify({
        nodes: [
          { type: 'keyword_planner', order: 1, config: {} },
          {
            type: 'text_generation',
            order: 2,
            config: {
              outputFormat: 'paragraph',
              tone: 'professional',
              textLength: 'medium',
            },
          },
        ],
      }),
    });
    const llm = {
      getChatModel: jest.fn().mockReturnValue({ invoke }),
    } as unknown as LlmService;
    const svc = new WorkflowGenerationService(llm);
    const rule = minimalRule('linkedin');
    const nodes = await svc.generate(rule, 'Thought leadership post on AI ethics');
    expect(nodes).toHaveLength(2);
    expect(llm.getChatModel).toHaveBeenCalledWith(
      expect.objectContaining({ temperature: expect.any(Number) }),
    );
    expect(nodes[0]?.type).toBe(WorkflowNodeType.KeywordPlanner);
    expect(nodes[1]?.type).toBe(WorkflowNodeType.TextGeneration);
  });
});
