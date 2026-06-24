import {
  NewsRelevanceService,
  tokenizeNewsKeywords,
} from './news-relevance.service';
import type { PickedArticle } from './news-picker.service';
import type { Rule } from '../../rule/schemas/rule.schema';

describe('NewsRelevanceService keyword pre-filter', () => {
  const service = new NewsRelevanceService({} as never);

  const article: PickedArticle = {
    title: 'Apple launches new AI chip for data centers',
    description: 'The technology giant expands its cloud AI offerings.',
    sourceId: 'techcrunch',
    pubDate: '2026-06-11',
    link: 'https://example.com',
    country: ['us'],
    language: 'en',
    category: ['technology'],
    importanceScore: 80,
    importanceReason: 'Major launch',
  };

  const baseRule = {
    ruleId: 'rule-1',
    brand: { industry: 'SaaS / Technology', brandName: 'Mosonic' },
    campaign: { goals: ['brand awareness'] },
    newsTrigger: { keywords: [] as string[] },
  } as Rule;

  it('passes when news trigger keywords are empty (relevance-only mode)', () => {
    expect(service.keywordPreFilter(article, baseRule)).toBe(true);
  });

  it('does not use brand industry or campaign goals as implicit filters', () => {
    const rule = {
      ...baseRule,
      newsTrigger: { keywords: [] },
    } as Rule;
    expect(service.keywordPreFilter(article, rule)).toBe(true);
  });

  it('matches explicit keywords via tokenized substring search', () => {
    const rule = {
      ...baseRule,
      newsTrigger: { keywords: ['AI chip'] },
    } as Rule;
    expect(service.keywordPreFilter(article, rule)).toBe(true);
  });

  it('fails when no explicit keyword token appears in headline or summary', () => {
    const rule = {
      ...baseRule,
      newsTrigger: { keywords: ['cryptocurrency'] },
    } as Rule;
    expect(service.keywordPreFilter(article, rule)).toBe(false);
  });
});

describe('tokenizeNewsKeywords', () => {
  it('splits multi-word and punctuated keywords into tokens', () => {
    expect(tokenizeNewsKeywords(['SaaS / Technology', 'brand awareness'])).toEqual(
      expect.arrayContaining(['saas', 'technology', 'brand', 'awareness']),
    );
  });
});
