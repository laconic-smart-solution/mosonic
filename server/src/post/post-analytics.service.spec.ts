import { BadRequestException } from '@nestjs/common';
import { PostAnalyticsService } from './post-analytics.service';
import { PlatformPostStatus, PostStatus } from './schemas/post.schema';
import {
  PlatformMetricSyncStatus,
  PostAnalyticsSyncStatus,
} from './schemas/post-analytics.schema';

describe('PostAnalyticsService', () => {
  const postAnalyticsModel = {
    findOne: jest.fn(),
    create: jest.fn(),
    findOneAndUpdate: jest.fn(),
    find: jest.fn(),
  };
  const postModel = { findOne: jest.fn(), find: jest.fn() };
  const syncLockModel = { updateOne: jest.fn(), deleteOne: jest.fn() };
  const zernioRest = { getPostAnalytics: jest.fn() };
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'HOSTNAME') return 'test';
      return undefined;
    }),
  };

  const service = new PostAnalyticsService(
    config as never,
    postAnalyticsModel as never,
    postModel as never,
    syncLockModel as never,
    zernioRest as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('ensureForPost creates placeholder for published post', async () => {
    const post = {
      postId: 'p1',
      zernioPostId: 'z1',
      ruleRef: 'r1',
      userId: 'u1',
      status: PostStatus.Published,
    };
    postAnalyticsModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });
    postAnalyticsModel.create.mockResolvedValue({
      postId: 'p1',
      syncStatus: PostAnalyticsSyncStatus.Pending,
    });

    await service.ensureForPost(post as never);

    expect(postAnalyticsModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        postId: 'p1',
        zernioPostId: 'z1',
        syncStatus: PostAnalyticsSyncStatus.Pending,
      }),
    );
  });

  it('ensureForPost skips scheduled posts', async () => {
    const post = {
      postId: 'p1',
      zernioPostId: 'z1',
      status: PostStatus.Scheduled,
    };
    const out = await service.ensureForPost(post as never);
    expect(out).toBeNull();
    expect(postAnalyticsModel.create).not.toHaveBeenCalled();
  });

  it('syncFromZernio maps partial post to published channels only', async () => {
    const post = {
      postId: 'p1',
      zernioPostId: 'z1',
      ruleRef: 'r1',
      userId: 'u1',
      status: PostStatus.Partial,
      channels: ['instagram', 'facebook'],
      platformResults: [
        { platform: 'instagram', status: PlatformPostStatus.Published },
        { platform: 'facebook', status: PlatformPostStatus.Failed },
      ],
    };
    postModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(post),
    });
    postAnalyticsModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ postId: 'p1' }),
    });
    zernioRest.getPostAnalytics.mockResolvedValue({
      platformAnalytics: [
        {
          platform: 'instagram',
          analytics: { views: 100, likes: 5, comments: 1, shares: 0 },
          syncStatus: 'synced',
        },
      ],
    });
    postAnalyticsModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        postId: 'p1',
        zernioPostId: 'z1',
        syncStatus: PostAnalyticsSyncStatus.Synced,
        pulledAt: new Date(),
        period: { from: new Date(), to: new Date() },
        platformMetrics: [
          {
            platform: 'instagram',
            syncStatus: PlatformMetricSyncStatus.Synced,
            metrics: { views: 100 },
            platformPostUrl: null,
            errorMessage: null,
          },
        ],
      }),
    });

    const out = await service.syncFromZernio('p1');

    expect(zernioRest.getPostAnalytics).toHaveBeenCalledWith(
      'z1',
      expect.any(Object),
    );
    expect(out.platformMetrics.some((m) => m.platform === 'facebook')).toBe(
      false,
    );
  });

  it('syncFromZernio rejects non-published statuses', async () => {
    postModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        postId: 'p1',
        status: PostStatus.Scheduled,
      }),
    });

    await expect(service.syncFromZernio('p1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
