import { BadRequestException } from '@nestjs/common';

jest.mock('../preprocessing/preprocessing.service', () => ({
  PreprocessingService: class PreprocessingService {},
}));
jest.mock('../preprocessing/content-reader.service', () => ({
  ContentReaderService: class ContentReaderService {},
}));
jest.mock('./rule-extraction.service', () => ({
  RuleExtractionService: class RuleExtractionService {},
}));
jest.mock('../events/events.service', () => ({
  EventsService: class EventsService {},
}));
import { UserRole } from '../users/schemas/user.schema';
import { RuleService } from './rule.service';
import { GenderOption, PostingFrequency } from './schemas/rule.schema';

type MockChain<T> = {
  exec: jest.Mock<Promise<T>, []>;
};

describe('RuleService updates', () => {
  const auth = { userId: 'user-1', role: UserRole.CUSTOMER };

  const existingRule = {
    ruleId: 'rule-1',
    userId: 'user-1',
    name: 'Old name',
    brand: { brandName: 'Brand' },
    audience: { ageRange: { min: 20, max: 50 } },
    campaign: {
      goals: ['awareness'],
      keywords: ['old'],
      hashtagStrategy: [],
      contentFormats: [],
      duration: {
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-01-31'),
      },
      postingFrequency: 'weekly',
      customSchedule: [],
    },
    channels: [],
    contentGuidelines: { seoGuidelines: {} },
  };

  const createService = () => {
    const findOneExec = jest.fn().mockResolvedValue(existingRule);
    const findOneAndUpdateExec = jest
      .fn()
      .mockResolvedValue({ ...existingRule });

    const ruleModel = {
      findOne: jest.fn(() => ({ exec: findOneExec })),
      findOneAndUpdate: jest.fn(() => ({ exec: findOneAndUpdateExec })),
    };

    const service = new RuleService(
      ruleModel as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    return { service, ruleModel };
  };

  it('rejects empty PATCH payloads', async () => {
    const { service } = createService();
    await expect(service.patchRule('rule-1', {}, auth)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('uses runValidators for PUT replacement updates', async () => {
    const { service, ruleModel } = createService();
    await service.replaceRule(
      'rule-1',
      {
        name: 'New name',
        brand: existingRule.brand as never,
        audience: {
          description: 'Audience',
          ageRange: { min: 20, max: 50 },
          gender: GenderOption.All,
          location: [],
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
          duration: { startDate: '2026-02-01', endDate: '2026-02-28' },
          postingFrequency: PostingFrequency.Weekly,
          customSchedule: [],
        },
        channels: [],
        contentGuidelines: {
          dos: [],
          donts: [],
          requiredElements: [],
          seoGuidelines: {
            primaryKeywords: [],
            secondaryKeywords: [],
            keywordDensity: 'natural',
          },
        },
      },
      auth,
    );

    expect(ruleModel.findOneAndUpdate).toHaveBeenCalledWith(
      { ruleId: 'rule-1', userId: 'user-1' },
      { $set: expect.any(Object) },
      { new: true, runValidators: true },
    );
  });
});
