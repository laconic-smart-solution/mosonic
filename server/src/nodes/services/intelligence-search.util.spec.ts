import type { Rule } from '../../rule/schemas/rule.schema';
import {
  appendAnalyticsContextToPrompt,
  buildIntelligenceSearchPrompt,
} from './intelligence-search.util';

function minimalRule(overrides?: Partial<Rule>): Rule {
  return {
    ruleId: 'rule-1',
    name: 'Test Rule',
    brand: {
      brandName: 'Acme Co',
      industry: 'Skincare',
      brandDescription: 'Premium skincare',
      brandTone: ['calm'],
      brandVoice: 'Expert',
      brandRestrictions: [],
      callToAction: 'Shop now',
    },
    audience: {
      description: 'Women 25-40',
      ageRange: { min: 25, max: 40 },
      gender: 'all',
      location: ['Bangkok', 'Singapore'],
      interests: [],
      painPoints: [],
      language: 'en',
      targetLanguages: ['en'],
    },
    campaign: {
      goals: [],
      keywords: [],
      hashtagStrategy: [],
      contentFormats: [],
      duration: { startDate: new Date(), endDate: new Date() },
      postingFrequency: 'weekly',
      customSchedule: [],
    },
    channels: [{ channel: 'instagram', contentStyle: 'reels', priority: 1 }],
    contentGuidelines: {
      dos: [],
      donts: [],
      requiredElements: [],
      seoGuidelines: { primaryKeywords: [], secondaryKeywords: [] },
    },
    originalInput: { rawText: '' },
    ...overrides,
  } as Rule;
}

describe('buildIntelligenceSearchPrompt', () => {
  const rule = minimalRule();

  it('includes brand and channels in trend prompt', () => {
    const p = buildIntelligenceSearchPrompt('trend', rule, null);
    expect(p).toContain('Skincare');
    expect(p).toContain('instagram');
    expect(p).toContain('Women 25-40');
  });

  it('uses audience location in market prompt', () => {
    const p = buildIntelligenceSearchPrompt('market', rule, null);
    expect(p).toContain('Bangkok');
    expect(p).toContain('Singapore');
  });

  it('uses brand name in competitor prompt', () => {
    const p = buildIntelligenceSearchPrompt('competitor', rule, null);
    expect(p).toContain('Acme Co');
  });

  it('covers three areas in all prompt', () => {
    const p = buildIntelligenceSearchPrompt('all', rule, null);
    expect(p).toContain('TREND');
    expect(p).toContain('MARKET');
    expect(p).toContain('COMPETITOR');
  });

  it('uses custom prompt verbatim for custom searchType', () => {
    const p = buildIntelligenceSearchPrompt(
      'custom',
      rule,
      'Find TikTok trends for SPF',
    );
    expect(p).toBe('Find TikTok trends for SPF');
  });
});

describe('appendAnalyticsContextToPrompt', () => {
  it('appends analytics block when context present', () => {
    const out = appendAnalyticsContextToPrompt('base', {
      topPerformers: [{ hook: 'sale' }],
      bottomPerformers: [],
      pendingSuggestions: [],
    });
    expect(out).toContain('base');
    expect(out).toContain('INTERNAL PERFORMANCE CONTEXT');
    expect(out).toContain('Top performers');
  });
});
