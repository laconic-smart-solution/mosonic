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
import { RuleService } from './rule.service';

type MockChain<T> = {
  exec: jest.Mock<Promise<T>, []>;
};

describe('RuleService updates', () => {
  const existingRule = {
    ruleId: 'rule-1',
    name: 'Old name',
    brand: { brandName: 'Brand' },
    audience: { ageRange: { min: 20, max: 50 } },
    campaign: {
      goals: ['awareness'],
      keywords: ['old'],
      hashtagStrategy: [],
      contentFormats: [],
      duration: { startDate: new Date('2026-01-01'), endDate: new Date('2026-01-31') },
      postingFrequency: 'weekly',
      customSchedule: [],
    },
    channels: [],
    contentGuidelines: { seoGuidelines: {} },
  };

  const createService = () => {
    const findOneExec = jest.fn().mockResolvedValue(existingRule);
    const findOneAndUpdateExec = jest.fn().mockResolvedValue({ ...existingRule });

    const ruleModel = {
      findOne: jest.fn(() => ({ exec: findOneExec }) as MockChain<typeof existingRule>),
      findOneAndUpdate: jest.fn(
        () => ({ exec: findOneAndUpdateExec }) as MockChain<typeof existingRule>,
      ),
    };

    const service = new RuleService(
      ruleModel as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    return { service, ruleModel };
  };

  it('rejects empty PATCH payloads', async () => {
    const { service } = createService();
    await expect(service.patchRule('rule-1', {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('uses runValidators for PUT replacement updates', async () => {
    const { service, ruleModel } = createService();
    await service.replaceRule('rule-1', {
      name: 'New name',
      brand: existingRule.brand as never,
      audience: {
        description: 'Audience',
        ageRange: { min: 20, max: 50 },
        gender: 'all',
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
        postingFrequency: 'weekly',
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
    });

    expect(ruleModel.findOneAndUpdate).toHaveBeenCalledWith(
      { ruleId: 'rule-1' },
      { $set: expect.any(Object) },
      { new: true, runValidators: true },
    );
  });
});
