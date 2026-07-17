jest.mock('../mcp/mcp.service', () => ({
  McpService: class McpService {},
}));

import { ConfigService } from '@nestjs/config';
import {
  PostStatus,
  type PostDocument,
} from '../post/schemas/post.schema';
import { UploadScheduledSyncService } from './upload-scheduled-sync.service';
import {
  UploadChannelStatus,
  UploadJobStatus,
} from './schemas/upload.schema';

describe('UploadScheduledSyncService', () => {
  const get = jest.fn();
  const config = { get: get } as unknown as ConfigService;

  const syncLockUpdateOne = jest.fn().mockReturnValue({
    exec: jest.fn(async () => ({ upsertedCount: 0, modifiedCount: 1 })),
  });
  const syncLockModel = { updateOne: syncLockUpdateOne };

  const getZernioPost = jest.fn();
  const mcpService = { getZernioPost };

  const emitToRoom = jest.fn();
  const events = { emitToRoom, emitUserNotification: jest.fn() };

  let leanScanDocs: Array<{ zernioPostId: string }>;
  let postsForZernioId: Record<string, PostDocument[]>;

  const postFindMock = jest.fn();

  function isLeanScheduledScan(filter: Record<string, unknown>): boolean {
    const zid = filter.zernioPostId;
    const hasNin =
      zid !== null &&
      typeof zid === 'object' &&
      !Array.isArray(zid) &&
      '$nin' in (zid as object);
    return filter.status === PostStatus.Scheduled && Boolean(hasNin);
  }

  function buildFindChain(filter: Record<string, unknown>) {
    const q: {
      select: () => typeof chain;
      lean: () => typeof chain;
      exec: jest.Mock;
    } = {
      select: () => chain,
      lean: () => chain,
      exec: jest.fn(async () => {
        const z = filter.zernioPostId;
        const idOnly =
          typeof z === 'string' && Object.keys(filter).length === 1;
        if (idOnly && !isLeanScheduledScan(filter)) {
          const id = (z as string).trim();
          return postsForZernioId[id] ?? [];
        }
        if (!isLeanScheduledScan(filter)) {
          return [];
        }
        return leanScanDocs;
      }),
    };
    const chain = q;
    return q;
  }

  postFindMock.mockImplementation((filter: Record<string, unknown>) =>
    buildFindChain(filter),
  );

  const findOne = jest.fn();
  const uploadModel = {
    findOne,
  };

  const postModel = { find: postFindMock };

  const postAnalyticsService = {
    ensureForPost: jest.fn().mockResolvedValue(null),
  };

  const comms = {
    notifyUser: jest.fn().mockResolvedValue(undefined),
  };

  const service = new UploadScheduledSyncService(
    config,
    uploadModel as never,
    postModel as never,
    syncLockModel as never,
    mcpService as never,
    events as never,
    postAnalyticsService as never,
    comms as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    leanScanDocs = [];
    postsForZernioId = {};
    get.mockImplementation((key: string) => {
      if (key === 'ZERNIO_SCHEDULED_SYNC_ENABLED') return undefined;
      if (key === 'ZERNIO_SYNC_INSTANCE_ID') return undefined;
      if (key === 'ZERNIO_SCHEDULED_SYNC_UPLOAD_BATCH') return 300;
      if (key === 'ZERNIO_SCHEDULED_SYNC_MCP_CONCURRENCY') return 5;
      return undefined;
    });
    getZernioPost.mockResolvedValue({ status: 'scheduled' });
    syncLockUpdateOne.mockReturnValue({
      exec: jest.fn(async () => ({ upsertedCount: 0, modifiedCount: 1 })),
    });
    findOne.mockReturnValue({ exec: async () => null });
  });

  it('calls getZernioPost once per distinct zernioPostId returned from scheduled posts scan', async () => {
    leanScanDocs = [
      { zernioPostId: 'p_shared' },
      { zernioPostId: 'p_shared' },
      { zernioPostId: 'p_other' },
    ];

    await service.syncScheduledPostsWithZernio();
    expect(getZernioPost).toHaveBeenCalledTimes(2);
    expect(getZernioPost).toHaveBeenCalledWith('p_shared');
    expect(getZernioPost).toHaveBeenCalledWith('p_other');
  });

  it('when ZERNIO_SYNC_INSTANCE_ID is set, skips work if lock not acquired', async () => {
    leanScanDocs = [{ zernioPostId: 'p1' }];
    get.mockImplementation((key: string) => {
      if (key === 'ZERNIO_SYNC_INSTANCE_ID') return 'pod-a';
      if (key === 'ZERNIO_SCHEDULED_SYNC_LOCK_LEASE_MS') return 300000;
      if (key === 'ZERNIO_SCHEDULED_SYNC_ENABLED') return undefined;
      return undefined;
    });
    syncLockUpdateOne.mockReturnValueOnce({
      exec: jest.fn(async () => ({ upsertedCount: 0, modifiedCount: 0 })),
    });
    syncLockUpdateOne.mockReturnValue({
      exec: jest.fn(async () => ({ upsertedCount: 0, modifiedCount: 0 })),
    });

    await service.syncScheduledPostsWithZernio();
    expect(getZernioPost).not.toHaveBeenCalled();
  });

  it('applies published decision and saves upload', async () => {
    leanScanDocs = [{ zernioPostId: 'p1' }];

    const postStub = {
      uploadRef: 'u_pub',
      zernioPostId: 'p1',
      channels: ['instagram'],
      status: PostStatus.Scheduled,
      save: jest.fn().mockResolvedValue(undefined),
    };
    postsForZernioId['p1'] = [postStub as never];

    getZernioPost.mockResolvedValue({ status: 'published' });

    const save = jest.fn().mockResolvedValue(undefined);
    const doc = {
      uploadId: 'u_pub',
      channels: [
        {
          channel: 'instagram',
          status: UploadChannelStatus.Scheduled,
          scheduledAt: new Date(),
          publishedAt: null,
          failureReason: null,
          caption: '',
          mediaUrl: null,
          mediaUrls: [],
          youtubeTitle: null,
          retryCount: 0,
        },
      ],
      status: UploadJobStatus.Partial,
      markModified: jest.fn(),
      save,
    };
    findOne.mockReturnValue({ exec: async () => doc });

    await service.syncScheduledPostsWithZernio();

    expect(doc.channels[0].status).toBe(UploadChannelStatus.Published);
    expect(emitToRoom).toHaveBeenCalledWith(
      'upload_u_pub',
      'upload:completed',
      expect.objectContaining({ postId: 'p1' }),
    );
    expect(save).toHaveBeenCalled();
    expect(postStub.save).toHaveBeenCalled();
  });
});
