import { BadRequestException } from '@nestjs/common';
import { UploadService } from './upload.service';
import { UploadChannelStatus, UploadJobStatus } from './schemas/upload.schema';

jest.mock('jose', () => ({
  SignJWT: class SignJWT {},
  jwtVerify: jest.fn(),
}));

describe('UploadService', () => {
  const findOne = jest.fn();
  const find = jest.fn();
  const collectionFindOne = jest.fn().mockResolvedValue(null);
  const uploadModel = {
    findOne,
    find,
    collection: { findOne: collectionFindOne },
  };
  const mcpService = {
    getConnectedAccounts: jest.fn(),
    publishCreatePostBatch: jest.fn(),
    updatePost: jest.fn(),
  };
  const events = {
    emitToRoom: jest.fn(),
  };

  const contentService = {
    autoApproveIfDraftForPublish: jest.fn().mockResolvedValue(undefined),
  };

  const service = new UploadService(
    uploadModel as never,
    mcpService as never,
    events as never,
    contentService as never,
  );

  function mockChannel(row: {
    channel: string;
    included?: boolean;
    caption?: string;
    mediaUrl?: string | null;
    mediaUrls?: string[];
    status?: UploadChannelStatus;
    youtubeTitle?: string | null;
    zernioPostId?: string | null;
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
      zernioPostId: row.zernioPostId ?? null,
      scheduledAt: row.scheduledAt ?? null,
      publishedAt: null,
      retryCount: 0,
      failureReason: null,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    collectionFindOne.mockResolvedValue(null);
    contentService.autoApproveIfDraftForPublish.mockResolvedValue(undefined);
  });

  it('calls Zernio once for included channels and marks published', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const doc = {
      uploadId: 'u1',
      contentRef: 'c1',
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
      { userId: 'user-1', role: 'CUSTOMER' as never },
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
    expect(doc.channels[0].zernioPostId).toBe('post_batch_1');
  });

  it('rejects schedule without future scheduledAt', async () => {
    const doc = {
      uploadId: 'u1',
      contentRef: 'c1',
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
        { userId: 'user-1', role: 'CUSTOMER' as never },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(mcpService.publishCreatePostBatch).not.toHaveBeenCalled();
  });

  it('passes scheduledAt to Zernio when publishing later', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const future = new Date(Date.now() + 3600_000).toISOString();
    const doc = {
      uploadId: 'u1',
      contentRef: 'c1',
      userId: 'user-1',
      channels: [mockChannel({ channel: 'twitter' })],
      resolvedOutputs: { text: 'hi' },
      status: UploadJobStatus.Pending,
      save,
    };
    findOne.mockReturnValue({
      exec: () => Promise.resolve(doc),
    });
    mcpService.getConnectedAccounts.mockResolvedValue({
      accounts: [
        { channel: 'twitter', accountId: 'acc_tw', connectedAt: new Date() },
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
        channels: [{ channel: 'twitter', included: true }],
      },
      { userId: 'user-1', role: 'CUSTOMER' as never },
    );

    expect(mcpService.publishCreatePostBatch).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        publishNow: false,
        scheduledAt: future,
      }),
    );
    expect(doc.channels[0].status).toBe(UploadChannelStatus.Scheduled);
  });

  it('partial publish does not mark non-included channels as skipped', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const doc = {
      uploadId: 'u1',
      contentRef: 'c1',
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
      { userId: 'user-1', role: 'CUSTOMER' as never },
    );

    expect(doc.channels[0].status).toBe(UploadChannelStatus.Published);
    expect(doc.channels[1].status).toBe(UploadChannelStatus.Published);
    expect(doc.channels[0].zernioPostId).toBeNull();
    expect(doc.channels[1].zernioPostId).toBe('post_b');
  });

  it('findByUploadId appends missing connected channels (included defaults true)', async () => {
    const doc = {
      uploadId: 'u1',
      contentRef: 'c1',
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
        { channel: 'twitter', accountId: 'acc_tw', connectedAt: new Date() },
      ],
    });

    const out = await service.findByUploadId('u1', {
      userId: 'user-1',
      role: 'CUSTOMER' as never,
    });

    const keys = out.channels.map((c) => c.channel.toLowerCase()).sort();
    expect(keys).toEqual(['instagram', 'twitter']);
    const twitter = out.channels.find((c) => c.channel.toLowerCase() === 'twitter');
    expect(twitter?.included).toBe(true);
  });

  it('publishUpload uses persisted included when channel is missing from request', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const doc = {
      uploadId: 'u1',
      contentRef: 'c1',
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
      { userId: 'user-1', role: 'CUSTOMER' as never },
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
        { userId: 'user-1', role: 'CUSTOMER' as never },
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
      userId: 'user-1',
      channels: [
        mockChannel({
          channel: 'instagram',
          caption: 'old caption',
          status: UploadChannelStatus.Scheduled,
          zernioPostId: 'post_1',
          scheduledAt: new Date(Date.now() + 1800_000),
        }),
        mockChannel({
          channel: 'youtube',
          caption: 'old caption',
          status: UploadChannelStatus.Scheduled,
          youtubeTitle: 'Old title',
          zernioPostId: 'post_1',
          scheduledAt: new Date(Date.now() + 1800_000),
        }),
        mockChannel({
          channel: 'facebook',
          caption: 'published caption',
          status: UploadChannelStatus.Published,
          zernioPostId: 'post_live',
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

    await service.updateUpload(
      'u1',
      {
        caption: 'new caption',
        scheduledAt: future,
        youtubeTitle: 'New title',
      },
      { userId: 'user-1', role: 'CUSTOMER' as never },
    );

    expect(mcpService.updatePost).toHaveBeenCalledTimes(1);
    expect(mcpService.updatePost).toHaveBeenCalledWith({
      postId: 'post_1',
      content: 'new caption',
      scheduledFor: future,
      title: 'New title',
    });
    expect(doc.channels[0].caption).toBe('new caption');
    expect(doc.channels[1].caption).toBe('new caption');
    expect(doc.channels[1].youtubeTitle).toBe('New title');
    expect(doc.channels[2].caption).toBe('published caption');
    expect(doc.channels[0].scheduledAt?.toISOString()).toBe(future);
    expect(doc.channels[1].scheduledAt?.toISOString()).toBe(future);
    expect(markModified).toHaveBeenCalledWith('channels');
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

  it('rejects update when no scheduled Zernio post exists', async () => {
    const doc = {
      uploadId: 'u1',
      contentRef: 'c1',
      userId: 'user-1',
      channels: [
        mockChannel({
          channel: 'instagram',
          status: UploadChannelStatus.Failed,
          zernioPostId: null,
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
        { userId: 'user-1', role: 'CUSTOMER' as never },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(mcpService.updatePost).not.toHaveBeenCalled();
  });

  it('rejects scheduled update with a non-future scheduledAt', async () => {
    const doc = {
      uploadId: 'u1',
      contentRef: 'c1',
      userId: 'user-1',
      channels: [
        mockChannel({
          channel: 'instagram',
          status: UploadChannelStatus.Scheduled,
          zernioPostId: 'post_1',
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
        { userId: 'user-1', role: 'CUSTOMER' as never },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(mcpService.updatePost).not.toHaveBeenCalled();
  });

  it('updates each distinct scheduled Zernio post id once', async () => {
    const doc = {
      uploadId: 'u1',
      contentRef: 'c1',
      userId: 'user-1',
      channels: [
        mockChannel({
          channel: 'instagram',
          status: UploadChannelStatus.Scheduled,
          zernioPostId: 'post_a',
        }),
        mockChannel({
          channel: 'facebook',
          status: UploadChannelStatus.Scheduled,
          zernioPostId: 'post_a',
        }),
        mockChannel({
          channel: 'linkedin',
          status: UploadChannelStatus.Scheduled,
          zernioPostId: 'post_b',
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

    await service.updateUpload(
      'u1',
      { caption: 'shared caption' },
      { userId: 'user-1', role: 'CUSTOMER' as never },
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
          channel: 'twitter',
          caption: 'user wrote this',
          mediaUrl: null,
        }),
      ];
      const fresh = [
        mockChannel({
          channel: 'twitter',
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
});
