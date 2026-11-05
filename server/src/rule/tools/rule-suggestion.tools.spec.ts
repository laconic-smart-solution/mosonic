import {
  createApplyRuleSuggestionTool,
  createSuggestRuleImprovementTool,
} from './rule-suggestion.tools';
import { PostStatus } from '../../post/schemas/post.schema';

const auth = { userId: 'u1', role: 'CUSTOMER' } as const;

describe('rule-suggestion.tools', () => {
  const ruleService = {
    getRuleById: jest.fn().mockResolvedValue({
      ruleId: 'r1',
      channels: [
        { channel: 'tiktok', priority: 'low' },
        { channel: 'instagram', priority: 'high' },
      ],
      brand: { brandTone: ['casual'] },
      campaign: { keywords: ['sale'] },
    }),
    applySuggestionFieldPatch: jest.fn().mockResolvedValue({ ruleId: 'r1' }),
  };
  const postService = {
    listPosts: jest.fn().mockResolvedValue({
      posts: [
        { postId: 'p1', contentRef: 'c1', status: PostStatus.Published },
        { postId: 'p2', contentRef: 'c2', status: PostStatus.Published },
      ],
      total: 2,
      page: 1,
      totalPages: 1,
    }),
    getPostDetail: jest
      .fn()
      .mockResolvedValueOnce({
        postId: 'p1',
        analytics: {
          platformMetrics: [
            {
              platform: 'tiktok',
              metrics: { engagementRate: 0.2, views: 1000 },
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        postId: 'p2',
        analytics: {
          platformMetrics: [
            {
              platform: 'instagram',
              metrics: { engagementRate: 0.05, views: 100 },
            },
          ],
        },
      }),
    syncPostAnalytics: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it('suggest_rule_improvement returns channel priority suggestions', async () => {
    const tool = createSuggestRuleImprovementTool(
      'r1',
      ruleService as never,
      postService as never,
      auth as never,
    );
    const raw = await tool.invoke({});
    const parsed = JSON.parse(raw as string);
    expect(parsed.ok).toBe(true);
    expect(parsed.action).toBe('rule_suggestions');
    expect(Array.isArray(parsed.suggestions)).toBe(true);
  });

  it('apply_rule_suggestion patches the rule', async () => {
    const tool = createApplyRuleSuggestionTool(
      'r1',
      ruleService as never,
      auth as never,
    );
    const raw = await tool.invoke({
      field: 'channels.tiktok.priority',
      suggestedValue: 'high',
    });
    const parsed = JSON.parse(raw as string);
    expect(parsed.ok).toBe(true);
    expect(parsed.action).toBe('rule_suggestion_applied');
    expect(ruleService.applySuggestionFieldPatch).toHaveBeenCalledWith(
      'r1',
      'channels.tiktok.priority',
      'high',
      auth,
    );
  });
});
