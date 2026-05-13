jest.mock('../mcp/mcp.service', () => ({
  McpService: class McpService {},
}));

import { ConfigService } from '@nestjs/config';
import { UploadScheduledSyncService } from './upload-scheduled-sync.service';
import {
  UploadChannelStatus,
  UploadJobStatus,
} from './schemas/upload.schema';

describe('UploadScheduledSyncService', () => {
  const get = jest.fn();
  const config = { get: get } as unknown as ConfigService;

  const syncLockUpdateOne = jest.fn().mockReturnValue({
    exec: async () => ({ upsertedCount: 0, modifiedCount: 1 }),
  });
  const syncLockModel = { updateOne: syncLockUpdateOne };

  const getZernioPost = jest.fn();
  const mcpService = { getZernioPost };

  const emitToRoom = jest.fn();
  const events = { emitToRoom };

  let batchCall = 0;
  const uploadFind = jest.fn().mockImplementation(() => ({
    select: () => ({
      sort: () => ({
        limit: () => ({
          lean: () => ({
            exec: async () => {
              batchCall++;
              if (batchCall === 1) {
                return [
                  {
                    _id: 'id1',
                    uploadId: 'u1',
                    channels: [
                      {
                        status: UploadChannelStatus.Scheduled,
                        zernioPostId: 'p_shared',
                      },
                    ],
                  },
                  {
                    _id: 'id2',
                    uploadId: 'u2',
                    channels: [
                      {
                        status: UploadChannelStatus.Scheduled,
                        zernioPostId: 'p_shared',
                      },
                    ],
                  },
                  {
                    _id: 'id3',
                    uploadId: 'u3',
                    channels: [
                      {
                        status: UploadChannelStatus.Scheduled,
                        zernioPostId: 'p_other',
                      },
                    ],
                  },
                ];
              }
              return [];
            },
          }),
        }),
      }),
    }),
  }));

  const findOne = jest.fn();
  const uploadModel = {
    find: uploadFind,
    findOne,
  };

  const service = new UploadScheduledSyncService(
    config,
    uploadModel as never,
    syncLockModel as never,
    mcpService as never,
    events as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    batchCall = 0;
    get.mockImplementation((key: string) => {
      if (key === 'ZERNIO_SCHEDULED_SYNC_ENABLED') return undefined;
      if (key === 'ZERNIO_SYNC_INSTANCE_ID') return undefined;
      if (key === 'ZERNIO_SCHEDULED_SYNC_UPLOAD_BATCH') return 300;
      if (key === 'ZERNIO_SCHEDULED_SYNC_MCP_CONCURRENCY') return 5;
      return undefined;
    });
    getZernioPost.mockResolvedValue({ status: 'scheduled' });
    syncLockUpdateOne.mockReturnValue({
      exec: async () => ({ upsertedCount: 0, modifiedCount: 1 }),
    });
    findOne.mockReturnValue({ exec: async () => null });
  });

  it('calls getZernioPost once per distinct postId for the whole run', async () => {
    await service.syncScheduledPostsWithZernio();
    expect(getZernioPost).toHaveBeenCalledTimes(2);
    expect(getZernioPost).toHaveBeenCalledWith('p_shared');
    expect(getZernioPost).toHaveBeenCalledWith('p_other');
  });

  it('when ZERNIO_SYNC_INSTANCE_ID is set, skips work if lock not acquired', async () => {
    get.mockImplementation((key: string) => {
      if (key === 'ZERNIO_SYNC_INSTANCE_ID') return 'pod-a';
      if (key === 'ZERNIO_SCHEDULED_SYNC_LOCK_LEASE_MS') return 300000;
      if (key === 'ZERNIO_SCHEDULED_SYNC_ENABLED') return undefined;
      if (key === 'ZERNIO_SCHEDULED_SYNC_UPLOAD_BATCH') return 300;
      if (key === 'ZERNIO_SCHEDULED_SYNC_MCP_CONCURRENCY') return 5;
      return undefined;
    });
    syncLockUpdateOne.mockReturnValueOnce({
      exec: async () => ({ upsertedCount: 0, modifiedCount: 0 }),
    });
    syncLockUpdateOne.mockReturnValue({
      exec: async () => ({ upsertedCount: 0, modifiedCount: 0 }),
    });

    await service.syncScheduledPostsWithZernio();
    expect(uploadFind).not.toHaveBeenCalled();
    expect(getZernioPost).not.toHaveBeenCalled();
  });

  it('applies published decision and saves upload', async () => {
    getZernioPost.mockImplementation((postId: string) => {
      if (postId === 'p1') return Promise.resolve({ status: 'published' });
      return Promise.resolve({ status: 'scheduled' });
    });
    batchCall = 0;
    uploadFind.mockImplementation(() => ({
      select: () => ({
        sort: () => ({
          limit: () => ({
            lean: () => ({
              exec: async () => {
                batchCall++;
                if (batchCall === 1) {
                  return [
                    {
                      _id: 'id1',
                      uploadId: 'u_pub',
                      channels: [
                        {
                          channel: 'instagram',
                          status: UploadChannelStatus.Scheduled,
                          zernioPostId: 'p1',
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
                    },
                  ];
                }
                return [];
              },
            }),
          }),
        }),
      }),
    }));

    const save = jest.fn().mockResolvedValue(undefined);
    const doc = {
      uploadId: 'u_pub',
      channels: [
        {
          channel: 'instagram',
          status: UploadChannelStatus.Scheduled,
          zernioPostId: 'p1',
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
  });
});
