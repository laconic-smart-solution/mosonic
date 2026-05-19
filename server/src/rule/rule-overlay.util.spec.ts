import { PostingFrequency } from './schemas/rule.schema';
import { mergeRuleWithOverlay } from './rule-overlay.util';

describe('mergeRuleWithOverlay', () => {
  const base = {
    ruleId: 'r1',
    name: 'Test',
    brand: {
      brandName: 'Acme',
      industry: 'Retail',
      brandDescription: 'Desc',
      brandTone: ['friendly'],
      brandVoice: 'Warm',
      callToAction: 'Shop',
    },
    audience: {
      ageRange: { min: 18, max: 35 },
      gender: 'all',
      interests: ['fashion'],
      language: 'en',
    },
    campaign: {
      goals: ['awareness'],
      keywords: ['sale'],
      hashtagStrategy: ['#sale'],
      contentFormats: ['image'],
      duration: '1 month',
      postingFrequency: PostingFrequency.Weekly,
      customSchedule: '',
    },
    channels: [
      {
        channel: 'instagram',
        priority: 'medium',
        contentStyle: 'short',
        contentMapping: { caption: 'text', media: null },
      },
    ],
    contentGuidelines: { restrictions: [], brandVoice: '' },
    originalInput: { type: 'text', value: 'x' },
    status: 'active',
    versions: [],
  } as never;

  it('merges applied campaign keyword patch', () => {
    const merged = mergeRuleWithOverlay(base, [
      {
        field: 'campaign.keywords',
        suggestedValue: ['summer', 'discount'],
      },
    ]);
    expect(merged.campaign.keywords).toEqual(['summer', 'discount']);
    expect(base.campaign.keywords).toEqual(['sale']);
  });
});
