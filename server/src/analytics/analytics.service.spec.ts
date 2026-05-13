jest.mock('../rule/rule.service', () => ({
  RuleService: class RuleService {},
}));

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UserRole } from '../users/schemas/user.schema';
import { AnalyticsService } from './analytics.service';
import { UploadChannelStatus } from '../upload/schemas/upload.schema';

describe('AnalyticsService split behavior', () => {
  const config = { get: jest.fn().mockReturnValue(undefined) };

  const syncLockModel = { updateOne: jest.fn(), deleteOne: jest.fn() };

  const contentModel = {
    find: jest.fn().mockReturnValue({ lean: jest.fn().mockReturnValue({ exec: jest.fn() }) }),
  };

  const uploadFindExec = jest.fn();
  const uploadModel = {
    find: jest.fn().mockReturnValue({ exec: uploadFindExec }),
  };

  const ruleFindExec = jest.fn();
  const ruleModel = {
    findOne: jest.fn().mockReturnValue({ exec: ruleFindExec }),
  };

  const analyticsRepository = {
    ensureForRule: jest.fn(),
    findByRuleRef: jest.fn(),
    findByAnalyticsId: jest.fn(),
    assertUserOwnsRule: jest.fn(),
    updateMetrics: jest.fn(),
    updateFeedbackSignal: jest.fn(),
  };

  const analyticsFeedback = { analyze: jest.fn() };

  const zernioRest = { getPostAnalytics: jest.fn() };

  const events = { emitToAnalyticsRule: jest.fn() };

  const ruleService = {};

  const service = new AnalyticsService(
    config as never,
    syncLockModel as never,
    contentModel as never,
    uploadModel as never,
    ruleModel as never,
    analyticsRepository as never,
    analyticsFeedback as never,
    zernioRest as never,
    events as never,
    ruleService as never,
  );

  // pullAnalyticsForRule pauses 500ms per post; skip those waits in tests.
  jest
    .spyOn(service as unknown as { sleep: (ms: number) => Promise<void> }, 'sleep')
    .mockResolvedValue(undefined);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('pull updates metrics in place with empty feedbackSignal and does not call the LLM', async () => {
    const rule = { ruleId: 'rule-1', userId: 'user-1' };
    uploadFindExec.mockResolvedValue([
      {
        uploadId: 'u1',
        contentRef: 'c1',
        workflowRef: 'wf1',
        channels: [
          {
            channel: 'instagram',
            zernioPostId: 'post_1',
            status: UploadChannelStatus.Published,
          },
        ],
      },
    ]);
    zernioRest.getPostAnalytics.mockResolvedValue({
      views: 100,
      likes: 10,
      comments: 1,
      shares: 1,
      reach: 100,
      engagement: 12,
      conversions: 0,
    });
    analyticsRepository.ensureForRule.mockResolvedValue({
      analyticsId: 'a1',
      ruleRef: 'rule-1',
    });
    analyticsRepository.updateMetrics.mockResolvedValue(true);
    analyticsRepository.findByRuleRef.mockResolvedValue({
      analyticsId: 'a1',
      ruleRef: 'rule-1',
    });

    const out = await service.pullAnalyticsForRule(rule as never);

    expect(out).not.toBeNull();
    expect(analyticsFeedback.analyze).not.toHaveBeenCalled();
    expect(analyticsRepository.ensureForRule).toHaveBeenCalledWith('rule-1');
    expect(analyticsRepository.updateMetrics).toHaveBeenCalledTimes(1);
    const updateArg = analyticsRepository.updateMetrics.mock.calls[0];
    expect(updateArg[0]).toBe('rule-1');
    expect(updateArg[1].contentPerformance).toHaveLength(1);
    expect(events.emitToAnalyticsRule).toHaveBeenCalledWith(
      'rule-1',
      'analytics:pull_completed',
      expect.any(Object),
    );
    expect(events.emitToAnalyticsRule).not.toHaveBeenCalledWith(
      'rule-1',
      'analytics:suggestion_ready',
      expect.any(Object),
    );
  });

  it('ensureForRule delegates to the repository upsert', async () => {
    analyticsRepository.ensureForRule.mockResolvedValue({
      analyticsId: 'a1',
      ruleRef: 'rule-1',
    });

    const out = await service.ensureForRule('rule-1');

    expect(out).not.toBeNull();
    expect(analyticsRepository.ensureForRule).toHaveBeenCalledWith('rule-1');
  });

  it('ensureForRule no-ops on empty input', async () => {
    const out = await service.ensureForRule('');
    expect(out).toBeNull();
    expect(analyticsRepository.ensureForRule).not.toHaveBeenCalled();
  });

  it('generateSuggestions runs the LLM, persists signal, and emits suggestion_ready', async () => {
    analyticsRepository.findByAnalyticsId.mockResolvedValue({
      analyticsId: 'a1',
      ruleRef: 'rule-1',
      contentPerformance: [{ channel: 'instagram' }],
      campaignSummary: { totalViews: 100 },
    });
    analyticsRepository.assertUserOwnsRule.mockResolvedValue(true);
    ruleFindExec.mockResolvedValue({ ruleId: 'rule-1', userId: 'user-1' });
    analyticsFeedback.analyze.mockResolvedValue({
      suggestions: [{ field: 'brand.brandTone' }],
    });
    analyticsRepository.updateFeedbackSignal.mockResolvedValue(true);

    const out = await service.generateSuggestions('a1', {
      userId: 'user-1',
      role: UserRole.CUSTOMER,
    });

    expect(analyticsFeedback.analyze).toHaveBeenCalledTimes(1);
    expect(analyticsRepository.updateFeedbackSignal).toHaveBeenCalledWith('a1', {
      suggestions: [{ field: 'brand.brandTone' }],
    });
    expect(events.emitToAnalyticsRule).toHaveBeenCalledWith(
      'rule-1',
      'analytics:suggestion_ready',
      expect.objectContaining({ analyticsId: 'a1', count: 1 }),
    );
    expect(out).toEqual({ analyticsId: 'a1', suggestionCount: 1 });
  });

  it('generateSuggestions rejects when the doc has no metrics yet', async () => {
    analyticsRepository.findByAnalyticsId.mockResolvedValue({
      analyticsId: 'a1',
      ruleRef: 'rule-1',
      contentPerformance: [],
      campaignSummary: {},
    });
    analyticsRepository.assertUserOwnsRule.mockResolvedValue(true);
    ruleFindExec.mockResolvedValue({ ruleId: 'rule-1' });

    await expect(
      service.generateSuggestions('a1', {
        userId: 'user-1',
        role: UserRole.CUSTOMER,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(analyticsFeedback.analyze).not.toHaveBeenCalled();
  });

  it('generateSuggestions 404s when analytics is missing', async () => {
    analyticsRepository.findByAnalyticsId.mockResolvedValue(null);

    await expect(
      service.generateSuggestions('missing', {
        userId: 'user-1',
        role: UserRole.CUSTOMER,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
