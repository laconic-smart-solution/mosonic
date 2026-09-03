import { BadRequestException } from '@nestjs/common';
import { WorkflowNodeType } from '../nodes/schemas/workflow-node.schema';
import {
  PipelineNodeExecutionStatus,
  type PipelineDocument,
} from '../pipeline/schemas/pipeline.schema';
import {
  CaptionMappingSource,
  ChannelMediaMapping,
} from '../rule/schemas/rule.schema';
import { UploadService } from './upload.service';
import { UploadChannelStatus, UploadJobStatus } from './schemas/upload.schema';

jest.mock('jose', () => ({
  SignJWT: class SignJWT {},
  jwtVerify: jest.fn(),
}));

jest.mock('../content/content.service', () => ({
  ContentService: class ContentService {},
}));

jest.mock('../rednote/rednote.service', () => ({
  RedNoteService: class RedNoteService {},
}));

describe('UploadService', () => {
  const findOne = jest.fn();
  const find = jest.fn();
  const collectionFindOne = jest.fn().mockResolvedValue(null);
  const uploadModel = {
    findOne,
    find,
    findByUploadIdScoped: jest.fn((...args: unknown[]) => {
      const result = findOne(...args) as { exec?: () => Promise<unknown> };
      if (result && typeof result.exec === 'function') {
        return result.exec();
      }
      return result;
    }),
    findByUploadId: jest.fn((...args: unknown[]) => {
      const result = findOne(...args) as { exec?: () => Promise<unknown> };
      if (result && typeof result.exec === 'function') {
        return result.exec();
      }
      return result;
    }),
    findLatestByContentRef: jest.fn(),
    save: jest.fn(async (doc: unknown) => doc),
    collection: { findOne: collectionFindOne },
  };
  const mcpService = {
    getConnectedAccounts: jest.fn(),
    publishCreatePostBatch: jest.fn(),
    updatePost: jest.fn(),
  };
  const rulesRepo = {
    findById: jest.fn(),
  };
  const ALL_TEST_CHANNELS_RULE = {
    channels: [
      { channel: 'instagram' },
      { channel: 'facebook' },
      { channel: 'linkedin' },
      { channel: 'tiktok' },
      { channel: 'youtube' },
      { channel: 'rednote' },
    ],
  };
  const redNoteService = {
    publishAndWait: jest.fn(),
    publishEnqueue: jest
      .fn()
      .mockResolvedValue({ success: true, jobId: 'job-1' }),
    getAccountStatus: jest.fn().mockResolvedValue({ connected: true }),
  };
  const events = {
    emitToRoom: jest.fn(),
    emitUserNotification: jest.fn(),
  };

  const contentService = {
    autoApproveIfDraftForPublish: jest.fn().mockResolvedValue(undefined),
  };

  const postService = {
    createPostFromSuccessfulPublish: jest
      .fn()
      .mockResolvedValue({ postId: 'local-post-id' }),
    findScheduledPostsForUpload: jest.fn().mockResolvedValue([]),
    updateScheduledPostsOnUpload: jest.fn().mockResolvedValue(undefined),
    updateScheduledPostForChannel: jest.fn().mockResolvedValue(undefined),
    discardOrphanedPost: jest.fn().mockResolvedValue(undefined),
  };

  const scheduler = {
    createPostPublish: jest.fn().mockResolvedValue({ id: 'job-1' }),
    reschedulePostPublish: jest.fn().mockResolvedValue({ id: 'job-1' }),
    cancelPostPublish: jest.fn().mockResolvedValue(undefined),
  };

  const comms = {
    notifyUser: jest.fn().mockResolvedValue(undefined),
  };

  const service = new UploadService(
    uploadModel as never,
    rulesRepo as never,
    mcpService as never,
    redNoteService as never,
    events as never,
    postService as never,
    contentService as never,
    scheduler as never,
    comms as never,
  );

  function mockChannel(row: {
    channel: string;
    included?: boolean;
    caption?: string;
    mediaUrl?: string | null;
    mediaUrls?: string[];
    status?: UploadChannelStatus;
    youtubeTitle?: string | null;
    scheduledAt?: Date | null;
  }) {
    return {
      channel: row.channel,
      included: row.included ?? true,
      status: row.status ?? UploadChannelStatus.Pending,
      caption: row.caption ?? '',
      mediaUrl: row.mediaUrl ?? null,
      mediaUrls: row.mediaUrls ?? [],
      youtubeTitle: row.youtubeTitle ?? null,
      scheduledAt: row.scheduledAt ?? null,
      publishedAt: null,
      retryCount: 0,
      failureReason: null,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    rulesRepo.findById.mockResolvedValue(ALL_TEST_CHANNELS_RULE);
    collectionFindOne.mockResolvedValue(null);
    contentService.autoApproveIfDraftForPublish.mockResolvedValue(undefined);
    postService.findScheduledPostsForUpload.mockResolvedValue([]);
    postService.createPostFromSuccessfulPublish.mockResolvedValue({
      postId: 'local-post-id',
    });
    postService.updateScheduledPostsOnUpload.mockResolvedValue(undefined);
    postService.updateScheduledPostForChannel.mockResolvedValue(undefined);
    postService.discardOrphanedPost.mockResolvedValue(undefined);
    scheduler.createPostPublish.mockResolvedValue({ id: 'job-1' });
    scheduler.reschedulePostPublish.mockResolvedValue({ id: 'job-1' });
    uploadModel.findLatestByContentRef.mockResolvedValue(null);
  });

  it('calls Zernio once with all included channels and marks published', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const doc = {
      uploadId: 'u1',
      contentRef: 'c1',
      ruleRef: 'rule-1',
      workflowRef: 'wf-1',
      userId: 'user-1',
      channels: [mockChannel({ channel: 'instagram' })],
      resolvedOutputs: { text: 'hello' },
      status: UploadJobStatus.Pending,
      save,
    };
    findOne.mockReturnValue({
      exec: () => Promise.resolve(doc),
    });
    mcpService.getConnectedAccounts.mockResolvedValue({
      accounts: [
        { channel: 'instagram', accountId: 'acc_1', connectedAt: new Date() },
      ],
    });
    mcpService.publishCreatePostBatch.mockResolvedValue({
      postId: 'post_batch_1',
      raw: {},
    });

    const res = await service.publishUpload(
      'u1',
      {
        publishNow: true,
        channels: [{ channel: 'instagram', included: true }],
      },
      { userId: 'user-1', role: 'CUSTOMER' },
    );

    expect(res).toEqual({ success: true });
    expect(contentService.autoApproveIfDraftForPublish).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ userId: 'user-1' }),
    );
    expect(mcpService.publishCreatePostBatch).toHaveBeenCalledTimes(1);
    expect(mcpService.publishCreatePostBatch).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        publishNow: true,
        scheduledAt: null,
        platforms: [
          expect.objectContaining({
            platform: 'instagram',
            accountId: 'acc_1',
            content: 'hello',
          }),
        ],
      }),
    );
    expect(doc.channels[0].status).toBe(UploadChannelStatus.Published);
    expect(postService.createPostFromSuccessfulPublish).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        ruleRef: 'rule-1',
        contentRef: 'c1',
        zernioPostId: 'post_batch_1',
        channels: ['instagram'],
        publishNow: true,
      }),
    );
  });

  it('passes all mediaUrls to Zernio for carousel publish', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const urls = ['https://example.com/1.jpg', 'https://example.com/2.jpg'];
    const doc = {
      uploadId: 'u1',
      contentRef: 'c1',
      ruleRef: 'rule-1',
      workflowRef: 'wf-1',
      userId: 'user-1',
      channels: [
        mockChannel({
          channel: 'instagram',
          caption: 'carousel caption',
          mediaUrl: urls[0],
          mediaUrls: urls,
        }),
      ],
      resolvedOutputs: { text: 'hello' },
      status: UploadJobStatus.Pending,
      save,
    };
    findOne.mockReturnValue({
      exec: () => Promise.resolve(doc),
    });
    mcpService.getConnectedAccounts.mockResolvedValue({
      accounts: [
        { channel: 'instagram', accountId: 'acc_1', connectedAt: new Date() },
      ],
    });
    mcpService.publishCreatePostBatch.mockResolvedValue({
      postId: 'post_carousel',
      raw: {},
    });

    await service.publishUpload(
      'u1',
      {
        publishNow: true,
        channels: [{ channel: 'instagram', included: true }],
      },
      { userId: 'user-1', role: 'CUSTOMER' },
    );

    expect(mcpService.publishCreatePostBatch).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        platforms: [
          expect.objectContaining({
            platform: 'instagram',
            accountId: 'acc_1',
            content: 'carousel caption',
            mediaUrl: urls[0],
            mediaUrls: urls,
          }),
        ],
      }),
    );
  });

  it('rejects TikTok publish without media', async () => {
    const doc = {
      uploadId: 'u1',
      contentRef: 'c1',
      ruleRef: 'rule-1',
      workflowRef: 'wf-1',
      userId: 'user-1',
      channels: [
        mockChannel({
          channel: 'tiktok',
          caption: 'tiktok caption',
          mediaUrl: null,
          mediaUrls: [],
        }),
      ],
      resolvedOutputs: { text: 'hello' },
      status: UploadJobStatus.Pending,
      save: jest.fn().mockResolvedValue(undefined),
    };
    findOne.mockReturnValue({
      exec: () => Promise.resolve(doc),
    });
    mcpService.getConnectedAccounts.mockResolvedValue({
      accounts: [
        { channel: 'tiktok', accountId: 'acc_tt', connectedAt: new Date() },
      ],
    });

    await expect(
      service.publishUpload(
        'u1',
        {
          publishNow: true,
          channels: [{ channel: 'tiktok', included: true }],
        },
        { userId: 'user-1', role: 'CUSTOMER' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(mcpService.publishCreatePostBatch).not.toHaveBeenCalled();
  });

  it('rejects TikTok photo publish when caption exceeds slideshow title limit', async () => {
    const longCaption = 'x'.repeat(120);
    const doc = {
      uploadId: 'u1',
      contentRef: 'c1',
      ruleRef: 'rule-1',
      workflowRef: 'wf-1',
      userId: 'user-1',
      channels: [
        mockChannel({
          channel: 'tiktok',
          caption: longCaption,
          mediaUrl: 'https://example.com/photo.png',
          mediaUrls: ['https://example.com/photo.png'],
        }),
      ],
      resolvedOutputs: { text: longCaption },
      status: UploadJobStatus.Pending,
      save: jest.fn().mockResolvedValue(undefined),
    };
    findOne.mockReturnValue({
      exec: () => Promise.resolve(doc),
    });
    mcpService.getConnectedAccounts.mockResolvedValue({
      accounts: [
        { channel: 'tiktok', accountId: 'acc_tt', connectedAt: new Date() },
      ],
    });

    await expect(
      service.publishUpload(
        'u1',
        {
          publishNow: true,
          channels: [{ channel: 'tiktok', included: true }],
        },
        { userId: 'user-1', role: 'CUSTOMER' },
      ),
    ).rejects.toMatchObject({
      message: expect.stringMatching(/90 characters max/),
    });

    expect(mcpService.publishCreatePostBatch).not.toHaveBeenCalled();
  });

  it('rejects YouTube publish without video', async () => {
    const doc = {
      uploadId: 'u1',
      contentRef: 'c1',
      ruleRef: 'rule-1',
      workflowRef: 'wf-1',
      userId: 'user-1',
      channels: [
        mockChannel({
          channel: 'youtube',
          caption: 'yt caption',
          mediaUrl: 'https://example.com/photo.png',
          mediaUrls: ['https://example.com/photo.png'],
        }),
      ],
      resolvedOutputs: {
        text: 'hello',
        image: 'https://example.com/photo.png',
      },
      status: UploadJobStatus.Pending,
      save: jest.fn().mockResolvedValue(undefined),
    };
    findOne.mockReturnValue({
      exec: () => Promise.resolve(doc),
    });
    mcpService.getConnectedAccounts.mockResolvedValue({
      accounts: [
        { channel: 'youtube', accountId: 'acc_yt', connectedAt: new Date() },
      ],
    });

    await expect(
      service.publishUpload(
        'u1',
        {
          publishNow: true,
          channels: [{ channel: 'youtube', included: true }],
        },
        { userId: 'user-1', role: 'CUSTOMER' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(mcpService.publishCreatePostBatch).not.toHaveBeenCalled();
  });

  it('rejects schedule without future scheduledAt', async () => {
    const doc = {
      uploadId: 'u1',
      contentRef: 'c1',
      ruleRef: 'rule-1',
      workflowRef: 'wf-1',
      userId: 'user-1',
      channels: [mockChannel({ channel: 'facebook' })],
      resolvedOutputs: { text: 'hello' },
      status: UploadJobStatus.Pending,
      save: jest.fn().mockResolvedValue(undefined),
    };
    findOne.mockReturnValue({
      exec: () => Promise.resolve(doc),
    });
    mcpService.getConnectedAccounts.mockResolvedValue({
      accounts: [
        { channel: 'facebook', accountId: 'acc_fb', connectedAt: new Date() },
      ],
    });

    await expect(
      service.publishUpload(
        'u1',
        {
          publishNow: false,
          scheduledAt: new Date(Date.now() - 60_000).toISOString(),
          channels: [{ channel: 'facebook', included: true }],
        },
        { userId: 'user-1', role: 'CUSTOMER' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(mcpService.publishCreatePostBatch).not.toHaveBeenCalled();
  });

  it('creates Zernio draft without scheduledAt and registers Mosonic scheduler job', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const future = new Date(Date.now() + 3600_000).toISOString();
    const doc = {
      uploadId: 'u1',
      contentRef: 'c1',
      ruleRef: 'rule-1',
      workflowRef: 'wf-1',
      userId: 'user-1',
      channels: [mockChannel({ channel: 'linkedin' })],
      resolvedOutputs: { text: 'hi' },
      status: UploadJobStatus.Pending,
      save,
    };
    findOne.mockReturnValue({
      exec: () => Promise.resolve(doc),
    });
    mcpService.getConnectedAccounts.mockResolvedValue({
      accounts: [
        { channel: 'linkedin', accountId: 'acc_li', connectedAt: new Date() },
      ],
    });
    mcpService.publishCreatePostBatch.mockResolvedValue({
      postId: 'sched_1',
      raw: {},
    });

    await service.publishUpload(
      'u1',
      {
        publishNow: false,
        scheduledAt: future,
        channels: [{ channel: 'linkedin', included: true }],
      },
      { userId: 'user-1', role: 'CUSTOMER' },
    );

    expect(mcpService.publishCreatePostBatch).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        publishNow: false,
        scheduledAt: null,
      }),
    );
    expect(scheduler.createPostPublish).toHaveBeenCalledWith(
      'local-post-id',
      future,
      undefined,
    );
    expect(doc.channels[0].status).toBe(UploadChannelStatus.Scheduled);
  });

  it('rolls back scheduled post when Mosonic scheduler registration fails', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const future = new Date(Date.now() + 3600_000).toISOString();
    const doc = {
      uploadId: 'u1',
      contentRef: 'c1',
      ruleRef: 'rule-1',
      workflowRef: 'wf-1',
      userId: 'user-1',
      channels: [mockChannel({ channel: 'linkedin' })],
      resolvedOutputs: { text: 'hi' },
      status: UploadJobStatus.Pending,
      save,
    };
    findOne.mockReturnValue({
      exec: () => Promise.resolve(doc),
    });
    mcpService.getConnectedAccounts.mockResolvedValue({
      accounts: [
        { channel: 'linkedin', accountId: 'acc_li', connectedAt: new Date() },
      ],
    });
    mcpService.publishCreatePostBatch.mockResolvedValue({
      postId: 'sched_1',
      raw: {},
    });
    scheduler.createPostPublish.mockRejectedValue(
      new Error('SCHEDULER_SERVICE_URL is not set'),
    );

    await service.publishUpload(
      'u1',
      {
        publishNow: false,
        scheduledAt: future,
        channels: [{ channel: 'linkedin', included: true }],
      },
      { userId: 'user-1', role: 'CUSTOMER' },
    );

    expect(postService.discardOrphanedPost).toHaveBeenCalledWith(
      'local-post-id',
    );
    expect(doc.channels[0].status).toBe(UploadChannelStatus.Failed);
    expect(doc.channels[0].failureReason).toMatch(/scheduling service/i);
  });

  it('schedules RedNote publish through Mosonic scheduler', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const future = new Date(Date.now() + 3_600_000).toISOString();
    const doc = {
      uploadId: 'u1',
      contentRef: 'c1',
      ruleRef: 'rule-1',
      workflowRef: 'wf-1',
      userId: 'user-1',
      channels: [
        mockChannel({
          channel: 'rednote',
          caption: 'hello rednote',
          mediaUrl: 'https://cdn.example/video.mp4',
          mediaUrls: ['https://cdn.example/video.mp4'],
        }),
      ],
      resolvedOutputs: { text: 'hello rednote' },
      status: UploadJobStatus.Pending,
      save,
    };
    findOne.mockReturnValue({
      exec: () => Promise.resolve(doc),
    });
    mcpService.getConnectedAccounts.mockResolvedValue({
      accounts: [
        { channel: 'rednote', accountId: 'acc_red', connectedAt: new Date() },
      ],
    });

    await service.publishUpload(
      'u1',
      {
        publishNow: false,
        scheduledAt: future,
        channels: [{ channel: 'rednote', included: true }],
      },
      { userId: 'user-1', role: 'CUSTOMER' },
    );

    expect(mcpService.publishCreatePostBatch).not.toHaveBeenCalled();
    expect(redNoteService.publishEnqueue).not.toHaveBeenCalled();
    expect(postService.createPostFromSuccessfulPublish).toHaveBeenCalledWith(
      expect.objectContaining({
        channels: ['rednote'],
        publishNow: false,
      }),
    );
    expect(scheduler.createPostPublish).toHaveBeenCalledTimes(1);
    expect(scheduler.createPostPublish).toHaveBeenCalledWith(
      'local-post-id',
      future,
      undefined,
    );
    expect(doc.channels[0].status).toBe(UploadChannelStatus.Scheduled);
  });

  it('partial publish does not mark non-included channels as skipped', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const doc = {
      uploadId: 'u1',
      contentRef: 'c1',
      ruleRef: 'rule-1',
      workflowRef: 'wf-1',
      userId: 'user-1',
      channels: [
        mockChannel({
          channel: 'instagram',
          caption: 'ig',
          status: UploadChannelStatus.Published,
        }),
        mockChannel({ channel: 'facebook', caption: 'fb' }),
      ],
      resolvedOutputs: { text: 'hello' },
      status: UploadJobStatus.Partial,
      save,
    };
    findOne.mockReturnValue({
      exec: () => Promise.resolve(doc),
    });
    mcpService.getConnectedAccounts.mockResolvedValue({
      accounts: [
        { channel: 'instagram', accountId: 'acc_ig', connectedAt: new Date() },
        { channel: 'facebook', accountId: 'acc_fb', connectedAt: new Date() },
      ],
    });
    mcpService.publishCreatePostBatch.mockResolvedValue({
      postId: 'post_b',
      raw: {},
    });

    await service.publishUpload(
      'u1',
      {
        publishNow: true,
        channels: [
          { channel: 'instagram', included: false },
          { channel: 'facebook', included: true },
        ],
      },
      { userId: 'user-1', role: 'CUSTOMER' },
    );

    expect(doc.channels[0].status).toBe(UploadChannelStatus.Published);
    expect(postService.createPostFromSuccessfulPublish).toHaveBeenCalledTimes(
      1,
    );
  });

  it('calls Zernio once with all included channels when multiple are selected', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const doc = {
      uploadId: 'u1',
      contentRef: 'c1',
      ruleRef: 'rule-1',
      workflowRef: 'wf-1',
      userId: 'user-1',
      channels: [
        mockChannel({ channel: 'instagram', caption: 'ig' }),
        mockChannel({ channel: 'facebook', caption: 'fb' }),
      ],
      resolvedOutputs: { text: 'hello' },
      status: UploadJobStatus.Pending,
      save,
    };
    findOne.mockReturnValue({
      exec: () => Promise.resolve(doc),
    });
    mcpService.getConnectedAccounts.mockResolvedValue({
      accounts: [
        { channel: 'instagram', accountId: 'acc_ig', connectedAt: new Date() },
        { channel: 'facebook', accountId: 'acc_fb', connectedAt: new Date() },
      ],
    });
    mcpService.publishCreatePostBatch.mockResolvedValue({
      postId: 'post_multi',
      raw: {},
    });

    await service.publishUpload(
      'u1',
      {
        publishNow: true,
        channels: [
          { channel: 'instagram', included: true },
          { channel: 'facebook', included: true },
        ],
      },
      { userId: 'user-1', role: 'CUSTOMER' },
    );

    expect(mcpService.publishCreatePostBatch).toHaveBeenCalledTimes(1);
    expect(mcpService.publishCreatePostBatch).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        publishNow: true,
        scheduledAt: null,
        platforms: [
          expect.objectContaining({
            platform: 'instagram',
            accountId: 'acc_ig',
            content: 'ig',
          }),
          expect.objectContaining({
            platform: 'facebook',
            accountId: 'acc_fb',
            content: 'fb',
          }),
        ],
      }),
    );
    expect(postService.createPostFromSuccessfulPublish).toHaveBeenCalledTimes(
      1,
    );
    expect(postService.createPostFromSuccessfulPublish).toHaveBeenCalledWith(
      expect.objectContaining({
        channels: ['instagram', 'facebook'],
        zernioPostId: 'post_multi',
      }),
    );
    expect(doc.channels[0].status).toBe(UploadChannelStatus.Published);
    expect(doc.channels[1].status).toBe(UploadChannelStatus.Published);
  });

  it('skips published channels even when included in request', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const doc = {
      uploadId: 'u1',
      contentRef: 'c1',
      ruleRef: 'rule-1',
      workflowRef: 'wf-1',
      userId: 'user-1',
      channels: [
        mockChannel({
          channel: 'instagram',
          caption: 'ig',
          status: UploadChannelStatus.Published,
        }),
        mockChannel({ channel: 'facebook', caption: 'fb' }),
      ],
      resolvedOutputs: { text: 'hello' },
      status: UploadJobStatus.Partial,
      save,
    };
    findOne.mockReturnValue({
      exec: () => Promise.resolve(doc),
    });
    mcpService.getConnectedAccounts.mockResolvedValue({
      accounts: [
        { channel: 'instagram', accountId: 'acc_ig', connectedAt: new Date() },
        { channel: 'facebook', accountId: 'acc_fb', connectedAt: new Date() },
      ],
    });
    mcpService.publishCreatePostBatch.mockResolvedValue({
      postId: 'post_fb',
      raw: {},
    });

    await service.publishUpload(
      'u1',
      {
        publishNow: true,
        channels: [
          { channel: 'instagram', included: true },
          { channel: 'facebook', included: true },
        ],
      },
      { userId: 'user-1', role: 'CUSTOMER' },
    );

    expect(mcpService.publishCreatePostBatch).toHaveBeenCalledTimes(1);
    expect(doc.channels[0].status).toBe(UploadChannelStatus.Published);
    expect(doc.channels[1].status).toBe(UploadChannelStatus.Published);
    expect(postService.createPostFromSuccessfulPublish).toHaveBeenCalledWith(
      expect.objectContaining({ channels: ['facebook'] }),
    );
  });

  it('findByUploadId appends missing connected channels (included defaults true)', async () => {
    const doc = {
      uploadId: 'u1',
      contentRef: 'c1',
      ruleRef: 'rule-1',
      workflowRef: 'wf-1',
      userId: 'user-1',
      channels: [mockChannel({ channel: 'instagram', caption: 'ig' })],
      resolvedOutputs: { text: 'hello' },
      status: UploadJobStatus.Pending,
      markModified: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
    };
    findOne.mockReturnValue({
      exec: () => Promise.resolve(doc),
    });
    mcpService.getConnectedAccounts.mockResolvedValue({
      accounts: [
        { channel: 'instagram', accountId: 'acc_ig', connectedAt: new Date() },
        { channel: 'linkedin', accountId: 'acc_li', connectedAt: new Date() },
      ],
    });

    const out = await service.findByUploadId('u1', {
      userId: 'user-1',
      role: 'CUSTOMER',
    });

    const keys = out.channels.map((c) => c.channel.toLowerCase()).sort();
    expect(keys).toEqual(['instagram', 'linkedin']);
    const linkedin = out.channels.find(
      (c) => c.channel.toLowerCase() === 'linkedin',
    );
    expect(linkedin?.included).toBe(true);
  });

  it('findByUploadId does not append a connected channel the rule does not list', async () => {
    const doc = {
      uploadId: 'u1',
      contentRef: 'c1',
      ruleRef: 'rule-1',
      workflowRef: 'wf-1',
      userId: 'user-1',
      channels: [mockChannel({ channel: 'instagram', caption: 'ig' })],
      resolvedOutputs: { text: 'hello' },
      status: UploadJobStatus.Pending,
      markModified: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
    };
    findOne.mockReturnValue({
      exec: () => Promise.resolve(doc),
    });
    // RedNote account is connected, but the campaign rule never listed it.
    rulesRepo.findById.mockResolvedValue({
      channels: [{ channel: 'instagram' }],
    });
    mcpService.getConnectedAccounts.mockResolvedValue({
      accounts: [
        { channel: 'instagram', accountId: 'acc_ig', connectedAt: new Date() },
        { channel: 'rednote', accountId: 'acc_red', connectedAt: new Date() },
      ],
    });

    const out = await service.findByUploadId('u1', {
      userId: 'user-1',
      role: 'CUSTOMER',
    });

    const keys = out.channels.map((c) => c.channel.toLowerCase()).sort();
    expect(keys).toEqual(['instagram']);
    expect(uploadModel.save).not.toHaveBeenCalled();
  });

  it('publishUpload uses persisted included when channel is missing from request', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const doc = {
      uploadId: 'u1',
      contentRef: 'c1',
      ruleRef: 'rule-1',
      workflowRef: 'wf-1',
      userId: 'user-1',
      channels: [
        mockChannel({ channel: 'instagram', caption: 'ig', included: false }),
        mockChannel({ channel: 'facebook', caption: 'fb', included: true }),
      ],
      resolvedOutputs: { text: 'hello' },
      status: UploadJobStatus.Pending,
      save,
    };
    findOne.mockReturnValue({
      exec: () => Promise.resolve(doc),
    });
    mcpService.getConnectedAccounts.mockResolvedValue({
      accounts: [
        { channel: 'instagram', accountId: 'acc_ig', connectedAt: new Date() },
        { channel: 'facebook', accountId: 'acc_fb', connectedAt: new Date() },
      ],
    });
    mcpService.publishCreatePostBatch.mockResolvedValue({
      postId: 'post_b',
      raw: {},
    });

    await service.publishUpload(
      'u1',
      {
        publishNow: true,
        // Only specifying Facebook; Instagram should remain excluded via persisted flag.
        channels: [{ channel: 'facebook', included: true }],
      },
      { userId: 'user-1', role: 'CUSTOMER' },
    );

    expect(mcpService.publishCreatePostBatch).toHaveBeenCalledTimes(1);
    const arg = mcpService.publishCreatePostBatch.mock.calls[0]![1] as {
      platforms: Array<{ platform: string }>;
    };
    expect(arg.platforms.map((p) => p.platform)).toEqual(['facebook']);
  });

  it('rejects publish when content cannot be auto-approved', async () => {
    contentService.autoApproveIfDraftForPublish.mockRejectedValueOnce(
      new BadRequestException(
        'This content cannot be published in its current state.',
      ),
    );
    const doc = {
      uploadId: 'u1',
      contentRef: 'c1',
      ruleRef: 'rule-1',
      workflowRef: 'wf-1',
      userId: 'user-1',
      channels: [mockChannel({ channel: 'instagram', caption: 'hi' })],
      resolvedOutputs: { text: 'hello' },
      status: UploadJobStatus.Pending,
      save: jest.fn(),
    };
    findOne.mockReturnValue({
      exec: () => Promise.resolve(doc),
    });
    mcpService.getConnectedAccounts.mockResolvedValue({
      accounts: [
        { channel: 'instagram', accountId: 'acc_1', connectedAt: new Date() },
      ],
    });

    await expect(
      service.publishUpload(
        'u1',
        {
          publishNow: true,
          channels: [{ channel: 'instagram', included: true }],
        },
        { userId: 'user-1', role: 'CUSTOMER' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(mcpService.publishCreatePostBatch).not.toHaveBeenCalled();
    expect(contentService.autoApproveIfDraftForPublish).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ userId: 'user-1' }),
    );
  });

  it('updates scheduled posts on Zernio and MongoDB', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const markModified = jest.fn();
    const future = new Date(Date.now() + 3600_000).toISOString();
    const doc = {
      uploadId: 'u1',
      contentRef: 'c1',
      ruleRef: 'rule-1',
      workflowRef: 'wf-1',
      userId: 'user-1',
      channels: [
        mockChannel({
          channel: 'instagram',
          caption: 'old caption',
          status: UploadChannelStatus.Scheduled,
          scheduledAt: new Date(Date.now() + 1800_000),
        }),
        mockChannel({
          channel: 'youtube',
          caption: 'old caption',
          status: UploadChannelStatus.Scheduled,
          youtubeTitle: 'Old title',
          scheduledAt: new Date(Date.now() + 1800_000),
        }),
        mockChannel({
          channel: 'facebook',
          caption: 'published caption',
          status: UploadChannelStatus.Published,
        }),
      ],
      resolvedOutputs: { text: 'fallback' },
      status: UploadJobStatus.Partial,
      markModified,
      save,
    };
    findOne.mockReturnValue({
      exec: () => Promise.resolve(doc),
    });
    mcpService.updatePost.mockResolvedValue({ success: true });
    postService.findScheduledPostsForUpload.mockResolvedValue([
      { postId: 'local-1', zernioPostId: 'post_1' },
    ] as never);

    await service.updateUpload(
      'u1',
      {
        caption: 'new caption',
        scheduledAt: future,
        youtubeTitle: 'New title',
      },
      { userId: 'user-1', role: 'CUSTOMER' },
    );

    expect(postService.updateScheduledPostsOnUpload).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({
        scheduledAt: expect.any(Date),
      }),
    );
    expect(mcpService.updatePost).toHaveBeenCalledTimes(1);
    expect(mcpService.updatePost).toHaveBeenCalledWith({
      postId: 'post_1',
      content: 'new caption',
      title: 'New title',
    });
    expect(scheduler.reschedulePostPublish).toHaveBeenCalledWith(
      'local-1',
      future,
      undefined,
    );
    expect(doc.channels[0].caption).toBe('new caption');
    expect(doc.channels[1].caption).toBe('new caption');
    expect(doc.channels[1].youtubeTitle).toBe('New title');
    expect(doc.channels[2].caption).toBe('published caption');
    expect(doc.channels[0].scheduledAt?.toISOString()).toBe(future);
    expect(doc.channels[1].scheduledAt?.toISOString()).toBe(future);
    expect(events.emitToRoom).toHaveBeenCalledWith(
      'upload_u1',
      'upload:updated',
      expect.objectContaining({
        uploadId: 'u1',
        caption: 'new caption',
        scheduledAt: future,
        youtubeTitle: 'New title',
      }),
    );
  });

  it('updates only the targeted scheduled channel when channel is set', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const markModified = jest.fn();
    const future = new Date(Date.now() + 3600_000).toISOString();
    const doc = {
      uploadId: 'u1',
      contentRef: 'c1',
      ruleRef: 'rule-1',
      workflowRef: 'wf-1',
      userId: 'user-1',
      channels: [
        mockChannel({
          channel: 'instagram',
          caption: 'old ig',
          status: UploadChannelStatus.Scheduled,
          scheduledAt: new Date(Date.now() + 1800_000),
        }),
        mockChannel({
          channel: 'youtube',
          caption: 'old yt',
          status: UploadChannelStatus.Scheduled,
          youtubeTitle: 'Old title',
          scheduledAt: new Date(Date.now() + 1800_000),
        }),
      ],
      resolvedOutputs: { text: 'fallback' },
      status: UploadJobStatus.Partial,
      markModified,
      save,
    };
    findOne.mockReturnValue({
      exec: () => Promise.resolve(doc),
    });
    mcpService.updatePost.mockResolvedValue({ success: true });
    postService.findScheduledPostsForUpload.mockResolvedValue([
      { postId: 'local-ig', zernioPostId: 'post_ig', channels: ['instagram'] },
      { postId: 'local-yt', zernioPostId: 'post_yt', channels: ['youtube'] },
    ] as never);

    await service.updateUpload(
      'u1',
      {
        channel: 'instagram',
        caption: 'new ig only',
        scheduledAt: future,
      },
      { userId: 'user-1', role: 'CUSTOMER' },
    );

    expect(mcpService.updatePost).toHaveBeenCalledTimes(1);
    expect(mcpService.updatePost).toHaveBeenCalledWith({
      postId: 'post_ig',
      content: 'new ig only',
      title: undefined,
    });
    expect(scheduler.reschedulePostPublish).toHaveBeenCalledWith(
      'local-ig',
      future,
      undefined,
    );
    expect(postService.updateScheduledPostForChannel).toHaveBeenCalledWith(
      'u1',
      'instagram',
      expect.objectContaining({
        scheduledAt: expect.any(Date),
        caption: 'new ig only',
      }),
    );
    expect(postService.updateScheduledPostsOnUpload).not.toHaveBeenCalled();
    expect(doc.channels[0].caption).toBe('new ig only');
    expect(doc.channels[1].caption).toBe('old yt');
  });

  it('rejects update when no scheduled Zernio post exists', async () => {
    const doc = {
      uploadId: 'u1',
      contentRef: 'c1',
      ruleRef: 'rule-1',
      workflowRef: 'wf-1',
      userId: 'user-1',
      channels: [
        mockChannel({
          channel: 'instagram',
          status: UploadChannelStatus.Failed,
        }),
      ],
      resolvedOutputs: { text: 'hello' },
      status: UploadJobStatus.Failed,
      save: jest.fn(),
    };
    findOne.mockReturnValue({
      exec: () => Promise.resolve(doc),
    });

    await expect(
      service.updateUpload(
        'u1',
        { caption: 'new caption' },
        { userId: 'user-1', role: 'CUSTOMER' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(mcpService.updatePost).not.toHaveBeenCalled();
  });

  it('rejects scheduled update with a non-future scheduledAt', async () => {
    const doc = {
      uploadId: 'u1',
      contentRef: 'c1',
      ruleRef: 'rule-1',
      workflowRef: 'wf-1',
      userId: 'user-1',
      channels: [
        mockChannel({
          channel: 'instagram',
          status: UploadChannelStatus.Scheduled,
        }),
      ],
      resolvedOutputs: { text: 'hello' },
      status: UploadJobStatus.Partial,
      save: jest.fn(),
    };
    findOne.mockReturnValue({
      exec: () => Promise.resolve(doc),
    });

    await expect(
      service.updateUpload(
        'u1',
        { scheduledAt: new Date(Date.now() - 60_000).toISOString() },
        { userId: 'user-1', role: 'CUSTOMER' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(mcpService.updatePost).not.toHaveBeenCalled();
  });

  it('updates each distinct scheduled Zernio post id once', async () => {
    const doc = {
      uploadId: 'u1',
      contentRef: 'c1',
      ruleRef: 'rule-1',
      workflowRef: 'wf-1',
      userId: 'user-1',
      channels: [
        mockChannel({
          channel: 'instagram',
          status: UploadChannelStatus.Scheduled,
        }),
        mockChannel({
          channel: 'facebook',
          status: UploadChannelStatus.Scheduled,
        }),
        mockChannel({
          channel: 'linkedin',
          status: UploadChannelStatus.Scheduled,
        }),
      ],
      resolvedOutputs: { text: 'hello' },
      status: UploadJobStatus.Partial,
      markModified: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
    };
    findOne.mockReturnValue({
      exec: () => Promise.resolve(doc),
    });
    mcpService.updatePost.mockResolvedValue({ success: true });
    postService.findScheduledPostsForUpload.mockResolvedValue([
      { zernioPostId: 'post_a' },
      { zernioPostId: 'post_b' },
    ] as never);

    await service.updateUpload(
      'u1',
      { caption: 'shared caption' },
      { userId: 'user-1', role: 'CUSTOMER' },
    );

    expect(mcpService.updatePost).toHaveBeenCalledTimes(2);
    expect(mcpService.updatePost).toHaveBeenCalledWith({
      postId: 'post_a',
      content: 'shared caption',
      scheduledFor: undefined,
      title: undefined,
    });
    expect(mcpService.updatePost).toHaveBeenCalledWith({
      postId: 'post_b',
      content: 'shared caption',
      scheduledFor: undefined,
      title: undefined,
    });
  });

  describe('mergeChannelsPreservingUserEdits', () => {
    it('preserves PATCHed mediaUrl when fresh rule row has no media', () => {
      const previous = [
        mockChannel({
          channel: 'facebook',
          caption: 'c',
          mediaUrl: 'https://example.com/uploads/a.png',
        }),
      ];
      const fresh = [
        mockChannel({
          channel: 'facebook',
          caption: 'c',
          mediaUrl: null,
          mediaUrls: [],
        }),
      ];
      const out = service.mergeChannelsPreservingUserEdits(fresh, previous);
      expect(out[0].mediaUrl).toBe('https://example.com/uploads/a.png');
    });

    it('preserves mediaUrls when set on previous row', () => {
      const previous = [
        mockChannel({
          channel: 'instagram',
          caption: 'x',
          mediaUrl: null,
          mediaUrls: ['https://a/1.jpg', 'https://a/2.jpg'],
        }),
      ];
      const fresh = [
        mockChannel({
          channel: 'instagram',
          caption: 'x',
          mediaUrl: null,
          mediaUrls: [],
        }),
      ];
      const out = service.mergeChannelsPreservingUserEdits(fresh, previous);
      expect(out[0].mediaUrls).toEqual(['https://a/1.jpg', 'https://a/2.jpg']);
    });

    it('preserves youtubeTitle when set', () => {
      const previous = [
        mockChannel({
          channel: 'youtube',
          caption: 'v',
          mediaUrl: null,
          youtubeTitle: 'My title',
        }),
      ];
      const fresh = [
        mockChannel({
          channel: 'youtube',
          caption: 'v',
          mediaUrl: null,
          youtubeTitle: null,
        }),
      ];
      const out = service.mergeChannelsPreservingUserEdits(fresh, previous);
      expect(out[0].youtubeTitle).toBe('My title');
    });

    it('preserves caption only when it differs from fresh automapped caption', () => {
      const previous = [
        mockChannel({
          channel: 'instagram',
          caption: 'user wrote this',
          mediaUrl: null,
        }),
      ];
      const fresh = [
        mockChannel({
          channel: 'instagram',
          caption: 'new auto from outputs',
          mediaUrl: null,
        }),
      ];
      const out = service.mergeChannelsPreservingUserEdits(fresh, previous);
      expect(out[0].caption).toBe('user wrote this');
    });

    it('uses fresh caption when same as previous (pick up refreshed copy)', () => {
      const previous = [
        mockChannel({ channel: 'linkedin', caption: 'same', mediaUrl: null }),
      ];
      const fresh = [
        mockChannel({ channel: 'linkedin', caption: 'same', mediaUrl: null }),
      ];
      const out = service.mergeChannelsPreservingUserEdits(fresh, previous);
      expect(out[0].caption).toBe('same');
    });
  });

  describe('buildChannelEntriesFromPipeline', () => {
    it('maps per-lane adapt node text into channel captions', () => {
      const pipeline = {
        graph: { lanes: ['instagram', 'facebook'] },
        nodes: [
          {
            nodeId: 'adapt_ig',
            lane: 'instagram',
            type: WorkflowNodeType.Adapt,
            status: PipelineNodeExecutionStatus.Completed,
            output: JSON.stringify({ text: 'IG-specific caption' }),
          },
          {
            nodeId: 'adapt_fb',
            lane: 'facebook',
            type: WorkflowNodeType.Adapt,
            status: PipelineNodeExecutionStatus.Completed,
            output: JSON.stringify({ text: 'FB-specific caption' }),
          },
        ],
      } as unknown as PipelineDocument;

      const ruleChannels = [
        {
          channel: 'instagram',
          priority: 'high',
          contentStyle: '',
          contentMapping: {
            caption: CaptionMappingSource.Text,
            media: null,
          },
        },
        {
          channel: 'facebook',
          priority: 'medium',
          contentStyle: '',
          contentMapping: {
            caption: CaptionMappingSource.Text,
            media: null,
          },
        },
      ];

      const entries = service.buildChannelEntriesFromPipeline(
        ruleChannels as never,
        pipeline,
        { text: 'shared trunk text' },
      );

      expect(entries).toHaveLength(2);
      expect(entries.find((e) => e.channel === 'instagram')?.caption).toBe(
        'IG-specific caption',
      );
      expect(entries.find((e) => e.channel === 'facebook')?.caption).toBe(
        'FB-specific caption',
      );
    });

    it('maps per-lane image nodes into channel mediaUrl', () => {
      const pipeline = {
        graph: { lanes: ['instagram', 'facebook'] },
        nodes: [
          {
            nodeId: 'img_ig',
            lane: 'instagram',
            type: WorkflowNodeType.ImageGeneration,
            status: PipelineNodeExecutionStatus.Completed,
            output: JSON.stringify({ image: 'https://cdn.example/ig.jpg' }),
          },
          {
            nodeId: 'img_fb',
            lane: 'facebook',
            type: WorkflowNodeType.ImageGeneration,
            status: PipelineNodeExecutionStatus.Completed,
            output: JSON.stringify({ image: 'https://cdn.example/fb.jpg' }),
          },
        ],
      } as unknown as PipelineDocument;

      const ruleChannels = [
        {
          channel: 'instagram',
          priority: 'high',
          contentStyle: '',
          contentMapping: {
            caption: CaptionMappingSource.Text,
            media: ChannelMediaMapping.Image,
          },
        },
        {
          channel: 'facebook',
          priority: 'medium',
          contentStyle: '',
          contentMapping: {
            caption: CaptionMappingSource.Text,
            media: ChannelMediaMapping.Image,
          },
        },
      ];

      const entries = service.buildChannelEntriesFromPipeline(
        ruleChannels as never,
        pipeline,
        {
          text: 'trunk',
          image: 'https://cdn.example/trunk.jpg',
        },
      );

      expect(entries.find((e) => e.channel === 'instagram')?.mediaUrl).toBe(
        'https://cdn.example/ig.jpg',
      );
      expect(entries.find((e) => e.channel === 'facebook')?.mediaUrl).toBe(
        'https://cdn.example/fb.jpg',
      );
    });

    it('does not copy facebook lane image onto channels without their own media', () => {
      const pipeline = {
        graph: { lanes: ['instagram', 'facebook', 'linkedin'] },
        nodes: [
          {
            nodeId: 'img_fb',
            lane: 'facebook',
            type: WorkflowNodeType.ImageGeneration,
            status: PipelineNodeExecutionStatus.Completed,
            output: JSON.stringify({ image: 'https://cdn.example/fb.jpg' }),
          },
          {
            nodeId: 'adapt_ig',
            lane: 'instagram',
            type: WorkflowNodeType.Adapt,
            status: PipelineNodeExecutionStatus.Completed,
            output: JSON.stringify({ text: 'IG caption' }),
          },
          {
            nodeId: 'adapt_fb',
            lane: 'facebook',
            type: WorkflowNodeType.Adapt,
            status: PipelineNodeExecutionStatus.Completed,
            output: JSON.stringify({ text: 'FB caption' }),
          },
          {
            nodeId: 'adapt_li',
            lane: 'linkedin',
            type: WorkflowNodeType.Adapt,
            status: PipelineNodeExecutionStatus.Completed,
            output: JSON.stringify({ text: 'LI caption' }),
          },
        ],
      } as unknown as PipelineDocument;

      const ruleChannels = ['instagram', 'facebook', 'linkedin'].map(
        (channel) => ({
          channel,
          priority: 'high',
          contentStyle: '',
          contentMapping: {
            caption: CaptionMappingSource.Text,
            media: ChannelMediaMapping.Image,
          },
        }),
      );

      const entries = service.buildChannelEntriesFromPipeline(
        ruleChannels as never,
        pipeline,
        {
          text: 'trunk',
          // Flattened snapshot includes facebook lane media — must not leak.
          image: 'https://cdn.example/fb.jpg',
        },
      );

      expect(entries.find((e) => e.channel === 'facebook')?.mediaUrl).toBe(
        'https://cdn.example/fb.jpg',
      );
      expect(
        entries.find((e) => e.channel === 'instagram')?.mediaUrl,
      ).toBeNull();
      expect(
        entries.find((e) => e.channel === 'linkedin')?.mediaUrl,
      ).toBeNull();
    });
  });

  describe('refreshUploadForApprove', () => {
    it('uses prebuilt channels when provided', async () => {
      const save = jest.fn().mockResolvedValue(undefined);
      const doc = {
        uploadId: 'u1',
        contentRef: 'c1',
        workflowRef: 'wf-1',
        ruleRef: 'rule-1',
        userId: 'user-1',
        channels: [],
        resolvedOutputs: { text: 'trunk only' },
        status: UploadJobStatus.Pending,
        save,
      };
      uploadModel.findLatestByContentRef.mockResolvedValue(doc);
      mcpService.getConnectedAccounts.mockResolvedValue({ accounts: [] });
      const customChannels = [
        mockChannel({ channel: 'instagram', caption: 'IG from adapt' }),
        mockChannel({ channel: 'facebook', caption: 'FB from adapt' }),
      ];

      await service.refreshUploadForApprove(
        {
          userId: 'user-1',
          contentRef: 'c1',
          workflowRef: 'wf-1',
          ruleRef: 'rule-1',
          resolvedOutputs: { text: 'trunk only' },
          ruleChannels: [],
          channels: customChannels,
        },
        { userId: 'user-1' },
      );

      expect(uploadModel.save).toHaveBeenCalled();
      const saved = uploadModel.save.mock.calls[0]?.[0] as {
        channels: Array<{ channel: string; caption: string }>;
      };
      expect(saved.channels).toHaveLength(2);
      expect(
        saved.channels.find((c) => c.channel === 'instagram')?.caption,
      ).toBe('IG from adapt');
      expect(
        saved.channels.find((c) => c.channel === 'facebook')?.caption,
      ).toBe('FB from adapt');
    });
  });
});
