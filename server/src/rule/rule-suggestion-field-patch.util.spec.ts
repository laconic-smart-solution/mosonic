import {
  buildSuggestionUpdateDto,
  isSupportedSuggestionField,
} from './rule-suggestion-field-patch.util';
import { ChannelPriority, PostingFrequency } from './schemas/rule.schema';
import type { RuleDocument } from './schemas/rule.schema';

describe('buildSuggestionUpdateDto', () => {
  const base = {
    brand: {
      brandName: 'X',
      industry: 'Y',
      brandDescription: 'Z',
      brandTone: ['formal'],
      brandVoice: 'v',
      brandRestrictions: [],
      callToAction: 'Go',
    },
    campaign: {
      goals: [],
      keywords: ['a'],
      hashtagStrategy: [],
      contentFormats: [],
      duration: { startDate: new Date(), endDate: new Date() },
      postingFrequency: PostingFrequency.Weekly,
      customSchedule: [],
    },
    channels: [
      {
        channel: 'instagram',
        priority: ChannelPriority.Medium,
        contentStyle: 'short',
      },
    ],
  } as Pick<RuleDocument, 'brand' | 'campaign' | 'channels'>;

  it('maps brand.brandTone', () => {
    const dto = buildSuggestionUpdateDto(base, 'brand.brandTone', ['casual']);
    expect(dto.brand?.brandTone).toEqual(['casual']);
  });

  it('merges channel priority', () => {
    const dto = buildSuggestionUpdateDto(
      base,
      'channels[instagram].priority',
      ChannelPriority.High,
    );
    expect(dto.channels?.[0]?.priority).toBe(ChannelPriority.High);
    expect(dto.channels?.[0]?.channel).toBe('instagram');
  });

  it('remaps brand.keywords to campaign.keywords', () => {
    const dto = buildSuggestionUpdateDto(base, 'brand.keywords', [
      'summer',
      'sale',
    ]);
    expect(dto.campaign?.keywords).toEqual(['summer', 'sale']);
    expect(dto.brand).toBeUndefined();
  });

  it('isSupportedSuggestionField accepts campaign and brand paths', () => {
    expect(isSupportedSuggestionField('campaign.keywords')).toBe(true);
    expect(isSupportedSuggestionField('brand.keywords')).toBe(true);
    expect(isSupportedSuggestionField('brand.brandVoice')).toBe(false);
    expect(isSupportedSuggestionField('audience.interests')).toBe(false);
  });
});
