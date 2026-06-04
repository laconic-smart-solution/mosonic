jest.mock('../rule/rule.service', () => ({
  RuleService: class RuleService {},
}));

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PostStatus } from '../post/schemas/post.schema';
import { UserRole } from '../users/schemas/user.schema';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService split behavior', () => {
  const config = { get: jest.fn().mockReturnValue(undefined) };

  const syncLockModel = { updateOne: jest.fn(), deleteOne: jest.fn() };

  const contentModel = {
    find: jest.fn().mockReturnValue({ lean: jest.fn().mockReturnValue({ exec: jest.fn() }) }),
  };

  const postFindExec = jest.fn();
  const postFindMock = jest.fn().mockReturnValue({
    select: () => ({
      lean: () => ({
        exec: postFindExec,
      }),
    }),
  });
  const postModel = { find: postFindMock };

  const uploadFindExec = jest.fn();
  const uploadModel = {
    find: jest.fn().mockReturnValue({
      select: () => ({
        lean: () => ({
          exec: uploadFindExec,
        }),
      }),
    }),
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
    postModel as never,
    contentModel as never,
    uploadModel as never,
    ruleModel as never,
    analyticsRepository as never,
    analyticsFeedback as never,
    zernioRest as never,
    events as never,
    ruleService as never,
  );

  jest
    .spyOn(service as unknown as { sleep: (ms: number) => Promise<void> }, 'sleep')
    .mockResolvedValue(undefined);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const zernioInstagramResponse = {
    syncStatus: 'synced',
    analytics: {
      impressions: 100,
      reach: 80,
      likes: 10,
      comments: 1,
      shares: 1,
      clicks: 5,
    },
    platformAnalytics: [
      {
        platform: 'instagram',
        syncStatus: 'synced',
        analytics: {
          impressions: 100,
          reach: 80,
          likes: 10,
          comments: 1,
          shares: 1,
          clicks: 5,
        },
      },
    ],
  };

  it('pull queries published and partial posts only', async () => {
    postFindExec.mockResolvedValue([]);
    const rule = { ruleId: 'rule-1', userId: 'user-1' };
    const out = await service.pullAnalyticsForRule(rule as never);
    expect(out).toBeNull();
    expect(postFindMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: { $in: [PostStatus.Published, PostStatus.Partial] },
      }),
    );
  });

  it('pull updates metrics with per-platform rows from Zernio', async () => {
    const rule = { ruleId: 'rule-1', userId: 'user-1' };
    postFindExec.mockResolvedValue([
      {
        contentRef: 'c1',
        uploadRef: 'u1',
        zernioPostId: 'post_1',
        channels: ['instagram'],
      },
    ]);
    uploadFindExec.mockResolvedValue([{ uploadId: 'u1', workflowRef: 'wf1' }]);
    zernioRest.getPostAnalytics.mockResolvedValue(zernioInstagramResponse);
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
    expect(out!.summary.platformRowsSynced).toBe(1);
    expect(analyticsFeedback.analyze).not.toHaveBeenCalled();
    expect(analyticsRepository.updateMetrics).toHaveBeenCalledTimes(1);
    const updateArg = analyticsRepository.updateMetrics.mock.calls[0];
    expect(updateArg[1].contentPerformance).toHaveLength(1);
    expect(updateArg[1].contentPerformance[0].metrics.views).toBe(100);
    expect(events.emitToAnalyticsRule).toHaveBeenCalledWith(
      'rule-1',
      'analytics:pull_completed',
      expect.objectContaining({
        summary: expect.objectContaining({ platformRowsSynced: 1 }),
      }),
    );
  });

  it('pull creates one row per platform for multi-channel posts', async () => {
    const rule = { ruleId: 'rule-1', userId: 'user-1' };
    postFindExec.mockResolvedValue([
      {
        contentRef: 'c1',
        uploadRef: 'u1',
        zernioPostId: 'post_multi',
        channels: ['twitter', 'facebook'],
      },
    ]);
    uploadFindExec.mockResolvedValue([{ uploadId: 'u1', workflowRef: 'wf1' }]);
    zernioRest.getPostAnalytics.mockResolvedValue({
      syncStatus: 'synced',
      platformAnalytics: [
        {
          platform: 'twitter',
          syncStatus: 'synced',
          analytics: { impressions: 600, likes: 6, reach: 500 },
        },
        {
          platform: 'facebook',
          syncStatus: 'synced',
          analytics: { impressions: 400, likes: 4, reach: 300 },
        },
      ],
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

    expect(zernioRest.getPostAnalytics).toHaveBeenCalledTimes(1);
    const updateArg = analyticsRepository.updateMetrics.mock.calls[0];
    expect(updateArg[1].contentPerformance).toHaveLength(2);
    expect(updateArg[1].contentPerformance[0].metrics.views).toBe(600);
    expect(updateArg[1].contentPerformance[1].metrics.views).toBe(400);
    expect(out!.summary.platformRowsSynced).toBe(2);
  });

  it('pull throws when Zernio returns sync pending with no metrics', async () => {
    const rule = { ruleId: 'rule-1', userId: 'user-1' };
    postFindExec.mockResolvedValue([
      {
        contentRef: 'c1',
        uploadRef: 'u1',
        zernioPostId: 'post_pending',
        channels: ['instagram'],
      },
    ]);
    uploadFindExec.mockResolvedValue([{ uploadId: 'u1', workflowRef: 'wf1' }]);
    zernioRest.getPostAnalytics.mockResolvedValue(null);

    await expect(
      service.pullAnalyticsForRule(rule as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(analyticsRepository.updateMetrics).not.toHaveBeenCalled();
    expect(events.emitToAnalyticsRule).toHaveBeenCalledWith(
      'rule-1',
      'analytics:pull_failed',
      expect.objectContaining({
        summary: expect.objectContaining({ pending: 1 }),
      }),
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
