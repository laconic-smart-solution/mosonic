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

function twoChannelRule(): Rule {
  const base = minimalRule('instagram');
  return {
    ...base,
    channels: [
      {
        channel: 'instagram',
        priority: ChannelPriority.High,
        contentStyle: 'casual',
      },
      {
        channel: 'linkedin',
        priority: ChannelPriority.Medium,
        contentStyle: 'professional',
      },
    ],
  };
}

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

  it('normalizeWorkflowAiNodes dedupes enrichment, sorts trunk, and renumbers order', () => {
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
    expect(out).toHaveLength(3);
    expect(out.filter((n) => n.type === WorkflowNodeType.KeywordPlanner)).toHaveLength(
      1,
    );
    expect(out.every((n) => n.isLocked === false)).toBe(true);
    expect(out.map((n) => n.order)).toEqual([1, 2, 3]);
    expect(out[out.length - 1]?.type).toBe(WorkflowNodeType.ImageGeneration);
  });

  it('normalizeWorkflowAiNodes injects text_generation when plan is image-only', () => {
    const rule = minimalRule('instagram');
    const logger = { warn: jest.fn() } as unknown as Logger;
    const out = normalizeWorkflowAiNodes(
      [{ type: 'image_generation', order: 1, config: { aspectRatio: '1:1' } }],
      rule,
      'hero image only',
      logger,
    );
    expect(out).toHaveLength(2);
    expect(out[0]?.type).toBe(WorkflowNodeType.TextGeneration);
    expect(out[1]?.type).toBe(WorkflowNodeType.ImageGeneration);
    expect(logger.warn).toHaveBeenCalledWith(
      'validateAndReorderNodes: missing text_generation; injecting default writer node',
    );
  });

  it('normalizeWorkflowAiNodes injects graph skeleton when rule is multi-channel but LLM omits branch', () => {
    const rule = twoChannelRule();
    const logger = { warn: jest.fn() } as unknown as Logger;
    const raw = [
      { type: 'keyword_planner', order: 1, config: {} },
      {
        type: 'text_generation',
        order: 2,
        config: { outputFormat: 'caption', tone: 'friendly' },
      },
      { type: 'image_generation', order: 3, config: { aspectRatio: '1:1' } },
    ];
    const out = normalizeWorkflowAiNodes(raw, rule, 'cross-post', logger);
    expect(out.map((n) => n.type)).toEqual([
      WorkflowNodeType.KeywordPlanner,
      WorkflowNodeType.TextGeneration,
      WorkflowNodeType.Branch,
      WorkflowNodeType.Adapt,
      WorkflowNodeType.ImageGeneration,
      WorkflowNodeType.Merge,
    ]);
    expect(logger.warn).toHaveBeenCalledWith(
      'validateAndReorderNodes: injecting branch for graph mode',
    );
    expect(logger.warn).toHaveBeenCalledWith(
      'validateAndReorderNodes: injecting adapt for graph mode',
    );
  });

  it('normalizeWorkflowAiNodes canonicalizes linear trunk order after parse', () => {
    const rule = minimalRule('instagram');
    const logger = { warn: jest.fn() } as unknown as Logger;
    const raw = [
      { type: 'image_generation', order: 1, config: { aspectRatio: '1:1' } },
      {
        type: 'text_generation',
        order: 2,
        config: { outputFormat: 'caption', tone: 'friendly' },
      },
      { type: 'keyword_planner', order: 3, config: {} },
    ];
    const out = normalizeWorkflowAiNodes(raw, rule, 'test', logger);
    expect(out.map((n) => n.type)).toEqual([
      WorkflowNodeType.KeywordPlanner,
      WorkflowNodeType.TextGeneration,
      WorkflowNodeType.ImageGeneration,
    ]);
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
