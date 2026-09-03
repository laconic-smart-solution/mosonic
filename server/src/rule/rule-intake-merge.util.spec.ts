import { mergeIntakeWithExtracted } from './rule-intake-merge.util';
import type { ExtractedRuleDraft } from './rule-extraction.service';
import type { RuleIntakeAnswers } from './rule-intake.types';

function baseDraft(): ExtractedRuleDraft {
  return {
    name: 'LLM Name',
    brand: {
      brandName: 'LLM Brand',
      industry: 'Tech',
      brandDescription: 'desc',
      brandTone: ['formal'],
      brandVoice: 'voice',
      brandRestrictions: [],
      callToAction: 'Buy now',
    },
    audience: {
      description: 'Everyone',
      ageRange: { min: 18, max: 65 },
      gender: 'all',
      location: ['US'],
      interests: [],
      painPoints: [],
      language: 'en',
      targetLanguages: ['en'],
    },
    campaign: {
      goals: ['awareness'],
      keywords: ['ai'],
      hashtagStrategy: ['#ai'],
      contentFormats: ['post'],
      duration: { startDate: '2026-01-01', endDate: '2026-12-31' },
      postingFrequency: 'weekly',
      customSchedule: [],
    },
    channels: [
      {
        channel: 'instagram',
        priority: 'high',
        contentStyle: 'reels',
        contentMapping: { caption: 'text', media: 'image' },
      },
    ],
    contentGuidelines: {
      dos: [],
      donts: [],
      requiredElements: [],
      seoGuidelines: {
        primaryKeywords: ['ai'],
        secondaryKeywords: [],
        keywordDensity: 'natural',
      },
    },
    status: 'active',
  };
}

describe('mergeIntakeWithExtracted', () => {
  it('overrides channels from guided intake', () => {
    const intake: RuleIntakeAnswers = {
      mode: 'guided',
      channels: [
        { channel: 'linkedin', priority: 'medium', contentStyle: 'article' },
      ],
    };
    const merged = mergeIntakeWithExtracted(intake, baseDraft());
    expect(merged.channels).toHaveLength(1);
    expect(merged.channels[0].channel).toBe('linkedin');
    expect(merged.channels[0].priority).toBe('medium');
  });

  it('clears hashtags when useHashtags is false', () => {
    const intake: RuleIntakeAnswers = {
      mode: 'guided',
      useHashtags: false,
    };
    const merged = mergeIntakeWithExtracted(intake, baseDraft());
    expect(merged.campaign.hashtagStrategy).toEqual([]);
  });

  it('leaves draft unchanged for express without purpose', () => {
    const intake: RuleIntakeAnswers = { mode: 'express' };
    const draft = baseDraft();
    const merged = mergeIntakeWithExtracted(intake, draft);
    expect(merged.brand.brandName).toBe(draft.brand.brandName);
  });
});
