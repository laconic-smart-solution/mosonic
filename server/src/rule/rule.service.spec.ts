import { BadRequestException, ForbiddenException } from '@nestjs/common';

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

describe('RuleService updates', () => {
  const auth = { userId: 'user-1', role: UserRole.CUSTOMER };

  const existingRule = {
    ruleId: 'rule-1',
    userId: 'user-1',
    isSystem: false,
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

  const createService = (overrideRule = existingRule) => {
    const rulesRepo = {
      findById: jest.fn().mockResolvedValue(overrideRule),
      updateById: jest.fn().mockResolvedValue({ ...overrideRule }),
      create: jest.fn().mockImplementation(async (data: { ruleId: string; name: string }) => ({
        ...overrideRule,
        ...data,
      })),
      deleteById: jest.fn(),
      findSystemTemplates: jest.fn().mockResolvedValue([
        {
          ruleId: 'sys-rule-1',
          name: 'E-Commerce Flash Sale',
          isSystem: true,
          isTemplate: true,
        },
      ]),
    };

    const creditService = {
      assertCreditsForNodeType: jest.fn().mockResolvedValue(undefined),
      deductCredits: jest.fn().mockResolvedValue(undefined),
    };

    const service = new RuleService(
      rulesRepo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      creditService as never,
    );

    return { service, rulesRepo, creditService };
  };

  it('rejects empty PATCH payloads', async () => {
    const { service } = createService();
    await expect(service.patchRule('rule-1', {}, auth)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('updates rule when replacement is valid', async () => {
    const { service, rulesRepo } = createService();
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

    expect(rulesRepo.updateById).toHaveBeenCalledWith(
      'rule-1',
      expect.objectContaining({ name: 'New name' }),
      auth,
    );
  });

  it('blocks customer from modifying a system rule template', async () => {
    const systemRule = { ...existingRule, ruleId: 'sys-1', isSystem: true, userId: null };
    const { service } = createService(systemRule);

    await expect(
      service.patchRule('sys-1', { name: 'Attempt edit' }, auth),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      service.replaceRule(
        'sys-1',
        {
          name: 'Attempt replace',
          brand: existingRule.brand as never,
          audience: {} as never,
          campaign: { duration: { startDate: '2026-01-01', endDate: '2026-01-31' } } as never,
          channels: [],
          contentGuidelines: {} as never,
        },
        auth,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows fetching system rule templates', async () => {
    const { service, rulesRepo } = createService();
    const result = await service.listSystemTemplates('E-Commerce');
    expect(rulesRepo.findSystemTemplates).toHaveBeenCalledWith('E-Commerce');
    expect(result).toHaveLength(1);
    expect(result[0].isSystem).toBe(true);
  });

  it('requestExtractionIntoRule reuses runExtraction on the existing ruleId', async () => {
    const { service, rulesRepo, creditService } = createService();
    (rulesRepo.findById as jest.Mock).mockResolvedValue({
      ruleId: 'blank-1',
      userId: auth.userId,
      name: 'Untitled brand',
      status: 'active',
    });
    const spy = jest
      .spyOn(service as never, 'runExtraction' as never)
      .mockResolvedValue(undefined as never);
    const out = await service.requestExtractionIntoRule(
      'blank-1',
      { input: 'Brand website: https://www.beautyphoo.com', files: [], urls: ['https://www.beautyphoo.com'] },
      auth,
    );
    expect(out).toEqual({ ruleId: 'blank-1' });
    expect(creditService.assertCreditsForNodeType).toHaveBeenCalled();
    expect(rulesRepo.create).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith(
      'blank-1',
      expect.objectContaining({ urls: ['https://www.beautyphoo.com'] }),
      auth,
      expect.objectContaining({ failureStatus: 'active' }),
    );
    spy.mockRestore();
  });
  it('creates an Untitled brand shell without extraction', async () => {
    const { service, rulesRepo } = createService();
    const created = await service.createBlankRule(auth);
    expect(created.name).toBe('Untitled brand');
    expect(created.ruleId).toBeTruthy();
    expect(rulesRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Untitled brand',
        status: 'active',
        userId: auth.userId,
        brand: expect.objectContaining({ brandName: 'Untitled' }),
      }),
    );
  });

  it('soft-deletes by archiving instead of hard delete', async () => {
    const { service, rulesRepo } = createService();
    await service.deleteRule('rule-1', auth);
    expect(rulesRepo.updateById).toHaveBeenCalledWith(
      'rule-1',
      { status: 'archived' },
      auth,
    );
    expect(rulesRepo.deleteById).not.toHaveBeenCalled();
  });

  it('blocks customer from deleting a system rule template', async () => {
    const systemRule = { ...existingRule, ruleId: 'sys-1', isSystem: true, userId: null };
    const { service, rulesRepo } = createService(systemRule);
    await expect(service.deleteRule('sys-1', auth)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(rulesRepo.updateById).not.toHaveBeenCalled();
  });
});
