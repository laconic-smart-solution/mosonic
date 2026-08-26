jest.mock('../mcp/mcp.service', () => ({
  McpService: class McpService {},
}));

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ListPostsQueryDto } from './dto/list-posts-query.dto';
import { PostListSort } from './dto/post-list-sort.enum';
import { PostService } from './post.service';
import { PlatformPostStatus, PostStatus } from './schemas/post.schema';
import { UploadChannelStatus } from '../upload/schemas/upload.schema';

describe('PostService', () => {
  const postModel = {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    findByPostId: jest.fn((postId: string) => {
      const result = postModel.findOne() as {
        exec?: () => Promise<unknown>;
      };
      if (result && typeof result.exec === 'function') {
        return result.exec();
      }
      return result;
    }),
    deleteByPostId: jest.fn().mockResolvedValue(true),
    deleteOne: jest.fn(),
    save: jest.fn().mockImplementation(async (doc: unknown) => doc),
    updateMany: jest.fn(),
    countDocuments: jest.fn(),
    aggregate: jest.fn(),
  };

  const uploadModel = {
    findOne: jest.fn(),
    find: jest.fn(),
    updateMany: jest.fn(),
  };

  const mcpService = {
    getConnectedAccounts: jest.fn(),
    publishCreatePostBatch: jest.fn(),
    updatePost: jest.fn(),
    getZernioPost: jest.fn(),
    deleteZernioPost: jest.fn(),
    unpublishZernioPost: jest.fn(),
  };

  const postAnalyticsService = {
    ensureForPost: jest.fn().mockResolvedValue(null),
    getDtoForPost: jest.fn().mockResolvedValue(null),
    syncFromZernio: jest.fn(),
  };

  const scheduler = {
    createPostPublish: jest.fn(),
    reschedulePostPublish: jest.fn(),
    cancelPostPublish: jest.fn().mockResolvedValue(undefined),
  };

  function service(): PostService {
    return new PostService(
      postModel as never,
      uploadModel as never,
      mcpService as never,
      postAnalyticsService as never,
      scheduler as never,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    uploadModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(null),
        }),
      }),
    });
  });

  it('bulkCancelScheduled skips missing posts gracefully', async () => {
    postModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });
    const res = await service().bulkCancelScheduled(['does-not-exist'], {
      userId: 'u1',
      role: 'CUSTOMER',
    });
    expect(res).toEqual({ succeeded: 0, failed: 1 });
  });

  it('deletePost soft-cancels scheduled post and resets upload channels to pending', async () => {
    const channel = {
      channel: 'linkedin',
      status: UploadChannelStatus.Scheduled,
      scheduledAt: new Date(),
      publishedAt: null as Date | null,
      failureReason: 'old',
    };
    const uploadDoc = {
      uploadId: 'upl-1',
      channels: [channel],
      status: 'scheduled',
      markModified: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
    };

    const scheduledPost = {
      postId: 'p-sched',
      userId: 'u1',
      status: PostStatus.Scheduled,
      zernioPostId: 'z-sched',
      uploadRef: 'upl-1',
      channels: ['linkedin'],
      platformResults: [
        {
          platform: 'linkedin',
          status: 'scheduled',
          platformUrl: null,
          publishedAt: null,
          failureReason: null,
        },
      ],
      scheduledAt: new Date(),
      publishedAt: null,
      failureReason: null,
    };
    postModel.findByPostId.mockResolvedValueOnce(scheduledPost);
    postModel.save.mockImplementation(async (doc: unknown) => doc);
    mcpService.deleteZernioPost.mockResolvedValue({ success: true });
    (uploadModel as { findByUploadId?: jest.Mock }).findByUploadId = jest
      .fn()
      .mockResolvedValue(uploadDoc);
    (uploadModel as { save?: jest.Mock }).save = jest
      .fn()
      .mockImplementation(async (doc: unknown) => doc);

    const res = await service().deletePost('p-sched', {
      userId: 'u1',
      role: 'CUSTOMER',
    });

    expect(scheduler.cancelPostPublish).toHaveBeenCalledWith('p-sched');
    expect(mcpService.deleteZernioPost).toHaveBeenCalledWith('z-sched');
    expect(postModel.deleteByPostId).not.toHaveBeenCalled();
    expect(postModel.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: PostStatus.Cancelled,
        scheduledAt: null,
        failureReason: 'Post deleted.',
      }),
    );
    expect(res.removed).toBe(false);
    expect(res.message).toBe('Post cancelled.');
    expect(channel.status).toBe(UploadChannelStatus.Pending);
    expect(channel.scheduledAt).toBeNull();
    expect(channel.failureReason).toBeNull();
  });

  it('deletePost unpublishes published post and skips unsupported platforms', async () => {
    const fbChannel = {
      channel: 'facebook',
      status: UploadChannelStatus.Published,
      scheduledAt: null as Date | null,
      publishedAt: new Date(),
      failureReason: null as string | null,
    };
    const igChannel = {
      channel: 'instagram',
      status: UploadChannelStatus.Published,
      scheduledAt: null as Date | null,
      publishedAt: new Date(),
      failureReason: null as string | null,
    };
    const uploadDoc = {
      uploadId: 'upl-2',
      channels: [fbChannel, igChannel],
      status: 'published',
      markModified: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
    };

    const postDoc = {
      postId: 'p-pub',
      userId: 'u1',
      status: PostStatus.Published,
      zernioPostId: 'z-pub',
      uploadRef: 'upl-2',
      channels: ['facebook', 'instagram'],
      platformResults: [
        {
          platform: 'facebook',
          status: PlatformPostStatus.Published,
          platformUrl: 'https://fb.com/x',
          publishedAt: new Date(),
          failureReason: null,
        },
        {
          platform: 'instagram',
          status: PlatformPostStatus.Published,
          platformUrl: 'https://ig.com/x',
          publishedAt: new Date(),
          failureReason: null,
        },
      ],
      publishedAt: new Date(),
      scheduledAt: null as Date | null,
      failureReason: null as string | null,
      save: jest.fn().mockResolvedValue(undefined),
    };

    postModel.findByPostId.mockResolvedValueOnce(postDoc);
    postModel.save.mockImplementation(async (doc: unknown) => {
      Object.assign(postDoc, doc as object);
      return doc;
    });
    mcpService.unpublishZernioPost.mockImplementation(
      (_id: string, platform: string) => {
        if (platform === 'instagram') {
          return Promise.resolve({ success: false, notSupported: true });
        }
        return Promise.resolve({ success: true });
      },
    );
    (uploadModel as { findByUploadId?: jest.Mock }).findByUploadId = jest
      .fn()
      .mockResolvedValue(uploadDoc);
    (uploadModel as { save?: jest.Mock }).save = jest
      .fn()
      .mockImplementation(async (doc: unknown) => doc);

    const res = await service().deletePost('p-pub', {
      userId: 'u1',
      role: 'CUSTOMER',
    });

    expect(res.removed).toBe(false);
    expect(res.skipped).toEqual(['instagram']);
    expect(postDoc.status).toBe(PostStatus.Cancelled);
    expect(fbChannel.status).toBe(UploadChannelStatus.Pending);
    expect(igChannel.status).toBe(UploadChannelStatus.Published);
    expect(postModel.save).toHaveBeenCalled();
  });

  it('deletePost is idempotent for cancelled posts', async () => {
    postModel.findByPostId.mockResolvedValueOnce({
      postId: 'p-done',
      userId: 'u1',
      status: PostStatus.Cancelled,
      channels: ['linkedin'],
    });

    const res = await service().deletePost('p-done', {
      userId: 'u1',
      role: 'CUSTOMER',
    });

    expect(res.message).toContain('already cancelled');
    expect(mcpService.deleteZernioPost).not.toHaveBeenCalled();
    expect(mcpService.unpublishZernioPost).not.toHaveBeenCalled();
  });

  it('retryPost rejects when status is not failed', async () => {
    const postDoc = {
      postId: 'p-local',
      userId: 'u1',
      status: PostStatus.Published,
    };
    postModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(postDoc),
    });
    await expect(
      service().retryPost('p-local', {
        userId: 'u1',
        role: 'CUSTOMER',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('publishPost rejects published posts', async () => {
    postModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        postId: 'p-pub',
        userId: 'u1',
        status: PostStatus.Published,
        zernioPostId: 'z1',
      }),
    });
    await expect(
      service().publishPost('p-pub', {
        userId: 'u1',
        role: 'CUSTOMER',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mcpService.updatePost).not.toHaveBeenCalled();
  });

  it('publishPost publishes scheduled Zernio post immediately', async () => {
    const postDoc = {
      postId: 'p-sched',
      userId: 'u1',
      status: PostStatus.Scheduled,
      zernioPostId: 'z-sched',
      uploadRef: 'upl-1',
      channels: ['linkedin'],
      scheduledAt: new Date('2030-01-01T00:00:00.000Z'),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const uploadDoc = {
      uploadId: 'upl-1',
      channels: [
        {
          channel: 'linkedin',
          status: UploadChannelStatus.Scheduled,
          scheduledAt: new Date('2030-01-01T00:00:00.000Z'),
          publishedAt: null as Date | null,
          failureReason: null as string | null,
        },
      ],
      status: 'scheduled',
      markModified: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
    };

    postModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(postDoc),
    });
    mcpService.updatePost.mockResolvedValue({ success: true });
    uploadModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(uploadDoc),
    });

    const res = await service().publishPost('p-sched', {
      userId: 'u1',
      role: 'CUSTOMER',
    });

    expect(mcpService.updatePost).toHaveBeenCalledWith({
      postId: 'z-sched',
      publishNow: true,
      scheduledFor: null,
    });
    expect(postDoc.status).toBe(PostStatus.Published);
    expect(postDoc.scheduledAt).toBeNull();
    expect(postDoc.publishedAt).toBeInstanceOf(Date);
    expect(res).toEqual({ postId: 'p-sched' });
    expect(uploadDoc.channels[0].status).toBe(UploadChannelStatus.Published);
  });

  it('patchPost rejects Published posts', async () => {
    const saveablePost = {
      postId: 'p-local',
      userId: 'u1',
      status: PostStatus.Published,
      zernioPostId: 'z1',
      save: jest.fn(),
    };
    postModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(saveablePost),
    });
    await expect(
      service().patchPost(
        'p-local',
        { content: 'x' },
        { userId: 'u1', role: 'CUSTOMER' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mcpService.updatePost).not.toHaveBeenCalled();
  });

  it('patchPost calls Zernio update and returns updated lean doc', async () => {
    const saveablePost = {
      postId: 'p-local',
      userId: 'u1',
      status: PostStatus.Scheduled,
      zernioPostId: 'z1',
      uploadRef: 'upl',
      scheduledAt: null as Date | null,
      failureReason: 'old',
      save: jest.fn().mockResolvedValue(undefined),
    };
    let findOneCalls = 0;
    postModel.findOne.mockImplementation(() => {
      findOneCalls += 1;
      if (findOneCalls === 1) {
        return {
          exec: jest.fn().mockResolvedValue(saveablePost),
        };
      }
      return {
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({
            postId: 'p-local',
            userId: 'u1',
            zernioPostId: 'z1',
            scheduledAt: new Date('2030-01-15T12:00:00.000Z'),
            failureReason: null,
            status: PostStatus.Scheduled,
          }),
        }),
      };
    });
    mcpService.updatePost.mockResolvedValue({ success: true });

    const res = await service().patchPost(
      'p-local',
      { scheduledAt: '2030-01-15T12:00:00.000Z' },
      { userId: 'u1', role: 'CUSTOMER' },
    );

    expect(mcpService.updatePost).toHaveBeenCalledWith({
      postId: 'z1',
      scheduledFor: '2030-01-15T12:00:00.000Z',
    });
    expect(saveablePost.save).toHaveBeenCalled();
    expect(res['postId']).toBe('p-local');
    expect(res['scheduledAt']).toBeDefined();
  });

  it('patchPost rejects when no fields supplied', async () => {
    const saveablePost = {
      postId: 'p-local',
      userId: 'u1',
      status: PostStatus.Scheduled,
      zernioPostId: 'z1',
      save: jest.fn(),
    };
    postModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(saveablePost),
    });
    await expect(
      service().patchPost('p-local', {}, { userId: 'u1', role: 'CUSTOMER' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('bulkSchedulePosts aggregates patch outcomes', async () => {
    const base = {
      userId: 'u1',
      status: PostStatus.Scheduled,
      uploadRef: 'upl',
      scheduledAt: null as Date | null,
      failureReason: null as string | null,
    };

    let goodFindPhase = 0;
    postModel.findOne.mockImplementation((filter: { postId?: string }) => {
      const pid = filter?.postId ?? '';
      if (pid === 'good') {
        goodFindPhase++;
        if (goodFindPhase === 1) {
          return {
            exec: jest.fn().mockResolvedValue({
              ...base,
              postId: 'good',
              zernioPostId: 'zg',
              save: jest.fn().mockResolvedValue(undefined),
            }),
          };
        }
        return {
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue({
              ...base,
              postId: 'good',
              zernioPostId: 'zg',
              status: PostStatus.Scheduled,
            }),
          }),
        };
      }
      return {
        exec: jest.fn().mockResolvedValue({
          ...base,
          postId: 'bad',
          zernioPostId: '',
          save: jest.fn(),
        }),
      };
    });

    mcpService.updatePost.mockResolvedValue({ success: true });

    const res = await service().bulkSchedulePosts(
      ['good', 'bad'],
      '2030-02-01T10:00:00.000Z',
      { userId: 'u1', role: 'CUSTOMER' },
    );

    expect(res).toEqual({ succeeded: 1, failed: 1 });
    expect(mcpService.updatePost).toHaveBeenCalledTimes(1);
    expect(mcpService.updatePost).toHaveBeenCalledWith({
      postId: 'zg',
      scheduledFor: '2030-02-01T10:00:00.000Z',
    });
  });

  it('getPostDetail with zernio hydrate merges remote snapshot', async () => {
    postModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        postId: 'p-local',
        zernioPostId: 'zr',
        userId: 'u1',
        uploadRef: 'upl-1',
        channels: ['facebook'],
        status: PostStatus.Scheduled,
        toObject: () => ({
          postId: 'p-local',
          zernioPostId: 'zr',
          userId: 'u1',
          uploadRef: 'upl-1',
          channels: ['facebook'],
          status: PostStatus.Scheduled,
        }),
      }),
    });
    uploadModel.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(null),
        }),
      }),
    });
    mcpService.getZernioPost.mockResolvedValue({ content: 'from zernio' });

    const detail = await service().getPostDetail(
      'p-local',
      { userId: 'u1', role: 'CUSTOMER' },
      'zernio',
    );

    expect(mcpService.getZernioPost).toHaveBeenCalledWith('zr');
    if ('local' in detail) {
      expect(detail.local['postId']).toBe('p-local');
      expect(detail.remote).toEqual({ content: 'from zernio' });
    } else {
      throw new Error('expected hydrated shape');
    }
  });

  it('getPostDetail skips Zernio hydrate for RedNote synthetic post ids', async () => {
    postModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        postId: 'p-rn',
        zernioPostId: 'rednote:8894601f-7de7-4113-84aa-425e7384d66a',
        userId: 'u1',
        uploadRef: 'upl-rn',
        channels: ['rednote'],
        status: PostStatus.Published,
        toObject: () => ({
          postId: 'p-rn',
          zernioPostId: 'rednote:8894601f-7de7-4113-84aa-425e7384d66a',
          userId: 'u1',
          uploadRef: 'upl-rn',
          channels: ['rednote'],
          status: PostStatus.Published,
        }),
      }),
    });
    uploadModel.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(null),
        }),
      }),
    });

    const detail = await service().getPostDetail(
      'p-rn',
      { userId: 'u1', role: 'CUSTOMER' },
      'zernio',
    );

    expect(mcpService.getZernioPost).not.toHaveBeenCalled();
    if ('local' in detail) {
      expect(detail.local['postId']).toBe('p-rn');
      expect(detail.remote).toBeNull();
    } else {
      throw new Error('expected hydrated shape');
    }
  });

  it('getPostDetail attaches mediaItems and detailCaption from upload', async () => {
    postModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        postId: 'p-media',
        userId: 'u1',
        uploadRef: 'u-media',
        channels: ['instagram'],
        status: PostStatus.Scheduled,
        toObject: () => ({
          postId: 'p-media',
          userId: 'u1',
          uploadRef: 'u-media',
          channels: ['instagram'],
          status: PostStatus.Scheduled,
        }),
      }),
    });
    uploadModel.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({
            uploadId: 'u-media',
            channels: [
              {
                channel: 'instagram',
                caption: 'Full caption text',
                mediaUrls: [
                  'https://cdn.example/a.png',
                  'https://cdn.example/b.mp4',
                ],
              },
            ],
            resolvedOutputs: {},
          }),
        }),
      }),
    });

    const detail = await service().getPostDetail('p-media', {
      userId: 'u1',
      role: 'CUSTOMER',
    });

    const local = 'local' in detail ? detail.local : detail;
    expect(local['detailCaption']).toBe('Full caption text');
    expect(local['mediaItems']).toEqual([
      { url: 'https://cdn.example/a.png', kind: 'image' },
      { url: 'https://cdn.example/b.mp4', kind: 'video' },
    ]);
  });

  it('patchPost yields NotFound when post missing', async () => {
    postModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });
    await expect(
      service().patchPost(
        'missing',
        { content: 'x' },
        { userId: 'u1', role: 'CUSTOMER' },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('getPostStats returns totals from aggregation', async () => {
    postModel.aggregate.mockReturnValue({
      exec: jest.fn().mockResolvedValue([
        { _id: PostStatus.Published, count: 2 },
        { _id: PostStatus.Failed, count: 1 },
      ]),
    });

    const res = await service().getPostStats({
      userId: 'u1',
      role: 'CUSTOMER',
    });

    expect(res.total).toBe(3);
    expect(res.byStatus.published).toBe(2);
    expect(res.byStatus.failed).toBe(1);
    expect(postModel.aggregate).toHaveBeenCalled();
  });

  it('listPosts attaches captionPreview from batched uploads', async () => {
    const leanExec = jest.fn().mockResolvedValue([
      {
        postId: 'p1',
        uploadRef: 'u1',
        channels: ['instagram'],
      },
    ]);
    postModel.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnValue({ exec: leanExec }),
    });
    postModel.countDocuments.mockReturnValue({
      exec: jest.fn().mockResolvedValue(1),
    });

    uploadModel.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([
            {
              uploadId: 'u1',
              channels: [{ channel: 'instagram', caption: 'hello world' }],
              resolvedOutputs: {},
            },
          ]),
        }),
      }),
    });

    const query = Object.assign(new ListPostsQueryDto(), {
      page: 1,
      limit: 20,
      sort: PostListSort.NewestCreated,
      search: 'p1',
    });

    const res = await service().listPosts(
      { userId: 'u1', role: 'CUSTOMER' },
      query,
    );

    expect(res.posts).toHaveLength(1);
    const row = res.posts[0] as Record<string, unknown>;
    expect(row['captionPreview']).toBe('hello world');
    expect(uploadModel.find).toHaveBeenCalledWith({
      uploadId: { $in: ['u1'] },
    });
  });

  it('listPosts attaches mediaPreviewUrl from upload channel media', async () => {
    const leanExec = jest.fn().mockResolvedValue([
      {
        postId: 'p2',
        uploadRef: 'u2',
        channels: ['instagram'],
      },
    ]);
    postModel.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnValue({ exec: leanExec }),
    });
    postModel.countDocuments.mockReturnValue({
      exec: jest.fn().mockResolvedValue(1),
    });

    uploadModel.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([
            {
              uploadId: 'u2',
              channels: [
                {
                  channel: 'instagram',
                  caption: 'cap',
                  mediaUrl: 'https://cdn.example/hero.png',
                },
              ],
              resolvedOutputs: {},
            },
          ]),
        }),
      }),
    });

    const query = Object.assign(new ListPostsQueryDto(), {
      page: 1,
      limit: 20,
      sort: PostListSort.NewestCreated,
    });

    const res = await service().listPosts(
      { userId: 'u1', role: 'CUSTOMER' },
      query,
    );

    const row = res.posts[0] as Record<string, unknown>;
    expect(row['mediaPreviewUrl']).toBe('https://cdn.example/hero.png');
    expect(row['mediaKind']).toBe('image');
  });
});
