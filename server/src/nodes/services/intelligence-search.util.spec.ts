import type { Rule } from '../../rule/schemas/rule.schema';
import {
  appendAnalyticsContextToPrompt,
  buildIntelligenceSearchPrompt,
} from './intelligence-search.util';

// `@toon-format/toon` is ESM-only; Jest's default transform can't parse it.
// These tests only assert on label substrings, not exact formatting.
jest.mock('../../common/utils/toon.util', () => ({
  toPromptToon: (data: unknown) => JSON.stringify(data),
}));

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
  const fixedNow = new Date('2026-06-25T12:00:00.000Z');

  it('includes brand and channels in trend prompt', () => {
    const p = buildIntelligenceSearchPrompt('trend', rule, null, fixedNow);
    expect(p).toContain('Skincare');
    expect(p).toContain('instagram');
    expect(p).toContain('Women 25-40');
    expect(p).toContain('2026-06-25');
    expect(p).toContain('CURRENT DATE');
  });

  it('uses audience location in market prompt', () => {
    const p = buildIntelligenceSearchPrompt('market', rule, null, fixedNow);
    expect(p).toContain('Bangkok');
    expect(p).toContain('Singapore');
    expect(p).toContain('past 7 days from today (2026-06-25)');
  });

  it('uses brand name in competitor prompt', () => {
    const p = buildIntelligenceSearchPrompt('competitor', rule, null, fixedNow);
    expect(p).toContain('Acme Co');
    expect(p).toContain('as of 2026-06-25');
  });

  it('covers three areas in all prompt', () => {
    const p = buildIntelligenceSearchPrompt('all', rule, null, fixedNow);
    expect(p).toContain('TREND');
    expect(p).toContain('MARKET');
    expect(p).toContain('COMPETITOR');
    expect(p).toContain('as of 2026-06-25');
  });

  it('prepends temporal context to custom searchType prompt', () => {
    const p = buildIntelligenceSearchPrompt(
      'custom',
      rule,
      'Find TikTok trends for SPF',
      fixedNow,
    );
    expect(p).toContain('Find TikTok trends for SPF');
    expect(p).toContain('2026-06-25');
    expect(p).toContain('CURRENT DATE');
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
