import { ContentStatus } from '@prisma/client';
import {
  createAddUploadMediaTool,
  createCancelScheduleTool,
  createEditUploadChannelTool,
  createGetUploadTool,
  createPreviewUploadTool,
  createPublishNowTool,
  createRemoveUploadMediaTool,
  createReschedulePublishTool,
  createRetryPublishTool,
  createSchedulePublishTool,
  validateUploadDetail,
} from './upload.tools';
import { isContentMutationStopObservation } from './content-scope.util';

const auth = { userId: 'u1', role: 'CUSTOMER' } as const;
const ruleId = 'r1';

const pageRow = {
  contentId: 'c1',
  pipelineRef: 'p1',
  workflowRef: 'w1',
  ruleRef: ruleId,
  status: ContentStatus.draft,
  updatedAt: '2026-01-02T00:00:00.000Z',
  createdAt: '2026-01-02T00:00:00.000Z',
  outputs: { text: 'hi', image: 'https://img' },
};

const content = {
  contentId: 'c1',
  pipelineRef: 'p1',
  workflowRef: 'w1',
  ruleRef: ruleId,
  status: ContentStatus.draft,
  currentVersion: 1,
  outputs: { text: 'hi', image: 'https://img' },
  userEdits: {},
  versions: [{ outputs: { text: 'hi', image: 'https://img' }, userEdits: {} }],
};

describe('upload.tools', () => {
  const workflowService = {
    getWorkflowByRuleId: jest.fn().mockResolvedValue({
      workflow: { workflowId: 'w1', ruleRef: ruleId, status: 'active' },
      nodes: [],
      edges: [],
    }),
    getWorkflow: jest.fn().mockResolvedValue({
      workflow: { workflowId: 'w1', ruleRef: ruleId, status: 'active' },
      nodes: [],
      edges: [],
    }),
  };
  const contents = {
    findPage: jest.fn().mockResolvedValue({ data: [pageRow], total: 1 }),
    findById: jest.fn().mockResolvedValue(content),
    findLatestByPipeline: jest.fn().mockResolvedValue(content),
  };
  const contentService = {
    approveContent: jest.fn().mockResolvedValue({ uploadId: 'up1' }),
    describeDraftNodes: jest.fn().mockResolvedValue({ nodes: [], lanes: [] }),
  };
  const uploadService = {
    findUploadIdByContentRef: jest.fn().mockResolvedValue({ uploadId: 'up1' }),
    findByUploadId: jest.fn().mockResolvedValue({
      uploadId: 'up1',
      contentRef: 'c1',
      status: 'draft',
      channels: [
        {
          channel: 'tiktok',
          included: true,
          status: 'pending',
          caption: 'hi',
          mediaUrl: 'https://img',
          mediaUrls: ['https://img'],
          failureReason: null,
        },
      ],
    }),
    publishUpload: jest.fn().mockResolvedValue({ success: true }),
    retryUpload: jest.fn().mockResolvedValue({ success: true }),
    patchUploadChannel: jest.fn().mockResolvedValue({ success: true }),
    updateUpload: jest.fn().mockResolvedValue({ success: true }),
  };
  const baseDetail = () => ({
    uploadId: 'up1',
    contentRef: 'c1',
    status: 'draft',
    channels: [
      { channel: 'tiktok', included: true, status: 'pending', caption: 'hi', mediaUrl: 'https://img', mediaUrls: ['https://img'], youtubeTitle: null, scheduledAt: null, publishedAt: null, failureReason: null },
      { channel: 'facebook', included: true, status: 'pending', caption: 'hi fb', mediaUrl: null, mediaUrls: [], youtubeTitle: null, scheduledAt: null, publishedAt: null, failureReason: null },
    ],
  });
  const postService = {
    retryPost: jest.fn().mockResolvedValue({ newPostId: 'post-2' }),
    findScheduledPostsForUpload: jest.fn().mockResolvedValue([]),
    deletePost: jest.fn().mockResolvedValue({ success: true }),
  };
  const resolveMedia = jest.fn(async (ids: string[]) =>
    ids.filter((id) => id !== 'nope').map((id) => ({ assetId: id, url: `https://asset/${id}` })),
  );
  const args = [ruleId, workflowService, contents, uploadService] as const;

  beforeEach(() => {
    jest.clearAllMocks();
    contents.findPage.mockResolvedValue({ data: [pageRow], total: 1 });
    contents.findById.mockResolvedValue(content);
    uploadService.findUploadIdByContentRef.mockResolvedValue({ uploadId: 'up1' });
    uploadService.findByUploadId.mockResolvedValue(baseDetail());
  });

  it('get_upload returns channel statuses', async () => {
    const tool = createGetUploadTool(
      ruleId,
      workflowService as never,
      contents as never,
      contentService as never,
      uploadService as never,
      auth as never,
    );
    const raw = await tool.invoke({});
    const parsed = JSON.parse(raw as string);
    expect(parsed.ok).toBe(true);
    expect(parsed.action).toBe('show_upload');
    expect(parsed.uploadId).toBe('up1');
    expect(parsed.channels[0].channel).toBe('tiktok');
  });

  it('publish_now publishes and stops the turn', async () => {
    const tool = createPublishNowTool(
      ruleId,
      workflowService as never,
      contents as never,
      contentService as never,
      uploadService as never,
      auth as never,
    );
    const raw = await tool.invoke({ channels: ['tiktok'] });
    const parsed = JSON.parse(raw as string);
    expect(parsed.ok).toBe(true);
    expect(parsed.action).toBe('publish_started');
    expect(uploadService.publishUpload).toHaveBeenCalled();
    expect(isContentMutationStopObservation(raw as string)).toBe(true);
  });

  it('schedule_publish requires scheduledAt', async () => {
    const tool = createSchedulePublishTool(
      ruleId,
      workflowService as never,
      contents as never,
      contentService as never,
      uploadService as never,
      auth as never,
    );
    const raw = await tool.invoke({ scheduledAt: ' ' });
    const parsed = JSON.parse(raw as string);
    expect(parsed.ok).toBe(false);
  });

  it('get_upload returns mediaUrls and caption previews', async () => {
    const tool = createGetUploadTool(ruleId, workflowService as never, contents as never, contentService as never, uploadService as never, auth as never);
    const parsed = JSON.parse((await tool.invoke({})) as string);
    expect(parsed.channels[0].mediaUrls).toEqual(['https://img']);
    expect(parsed.channels[0].captionPreview).toBe('hi');
    expect(parsed.issues).toEqual([]);
  });

  it('publish_now refuses when a media-required channel has no media', async () => {
    const d = baseDetail();
    d.channels[0].mediaUrl = null;
    d.channels[0].mediaUrls = [];
    uploadService.findByUploadId.mockResolvedValue(d);
    const tool = createPublishNowTool(ruleId, workflowService as never, contents as never, contentService as never, uploadService as never, auth as never);
    const parsed = JSON.parse((await tool.invoke({ channels: ['tiktok'] })) as string);
    expect(parsed.code).toBe('upload_invalid');
    expect(uploadService.publishUpload).not.toHaveBeenCalled();
  });

  it('validateUploadDetail flags caption, media and youtube title', () => {
    const r = validateUploadDetail({
      channels: [
        { channel: 'instagram', included: true, caption: '', mediaUrl: null, mediaUrls: [] },
        { channel: 'youtube', included: true, caption: '', mediaUrl: 'v', mediaUrls: ['v'], youtubeTitle: '' },
        { channel: 'facebook', included: false, caption: '', mediaUrl: null, mediaUrls: [] },
      ] as never,
    });
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => `${i.channel}:${i.problem}`)).toEqual([
      'instagram:caption is empty',
      'instagram:needs an image or video (add_upload_media)',
      'youtube:YouTube title is empty',
    ]);
  });

  it('add_upload_media appends resolved brand assets to included channels', async () => {
    const tool = createAddUploadMediaTool(...(args as never as [string, never, never, never]), auth as never, resolveMedia);
    const parsed = JSON.parse((await tool.invoke({ assetIds: ['a1'] })) as string);
    expect(parsed.action).toBe('upload_media_added');
    expect(uploadService.patchUploadChannel).toHaveBeenCalledWith('up1', 'tiktok', { mediaUrl: 'https://img', mediaUrls: ['https://img', 'https://asset/a1'] }, auth);
    expect(uploadService.patchUploadChannel).toHaveBeenCalledWith('up1', 'facebook', { mediaUrl: 'https://asset/a1', mediaUrls: ['https://asset/a1'] }, auth);
  });

  it('add_upload_media rejects unknown asset ids and locked channels', async () => {
    const tool = createAddUploadMediaTool(...(args as never as [string, never, never, never]), auth as never, resolveMedia);
    expect(JSON.parse((await tool.invoke({ assetIds: ['nope'] })) as string).code).toBe('not_found');
    const d = baseDetail();
    d.channels[0].status = 'scheduled';
    uploadService.findByUploadId.mockResolvedValue(d);
    expect(JSON.parse((await tool.invoke({ assetIds: ['a1'], channels: ['tiktok'] })) as string).code).toBe('channel_locked');
    expect(uploadService.patchUploadChannel).not.toHaveBeenCalled();
  });

  it('add_upload_media reports no_upload before approval', async () => {
    uploadService.findUploadIdByContentRef.mockRejectedValueOnce(new Error('nf'));
    const tool = createAddUploadMediaTool(...(args as never as [string, never, never, never]), auth as never, resolveMedia);
    expect(JSON.parse((await tool.invoke({ assetIds: ['a1'] })) as string).code).toBe('no_upload');
  });

  it('remove_upload_media removes listed urls or all', async () => {
    const tool = createRemoveUploadMediaTool(...(args as never as [string, never, never, never]), auth as never);
    const one = JSON.parse((await tool.invoke({ mediaUrls: ['https://img'] })) as string);
    expect(one.action).toBe('upload_media_removed');
    expect(uploadService.patchUploadChannel).toHaveBeenCalledWith('up1', 'tiktok', { mediaUrl: null, mediaUrls: [] }, auth);
    expect(JSON.parse((await tool.invoke({ mediaUrls: ['https://other'] })) as string).code).toBe('no_change');
    expect(JSON.parse((await tool.invoke({})) as string).code).toBe('bad_request');
  });

  it('edit_upload_channel patches caption / include and guards youtubeTitle', async () => {
    const tool = createEditUploadChannelTool(...(args as never as [string, never, never, never]), auth as never);
    const ok = JSON.parse((await tool.invoke({ channel: 'facebook', caption: 'New words', included: false })) as string);
    expect(ok.action).toBe('upload_channel_updated');
    expect(uploadService.patchUploadChannel).toHaveBeenCalledWith('up1', 'facebook', { included: false, caption: 'New words' }, auth);
    expect(JSON.parse((await tool.invoke({ channel: 'facebook', youtubeTitle: 'T' })) as string).code).toBe('bad_request');
    expect(JSON.parse((await tool.invoke({ channel: 'x' , caption: 'a'})) as string).code).toBe('bad_request');
  });

  it('preview_upload is read-only and reports readiness', async () => {
    const tool = createPreviewUploadTool(...(args as never as [string, never, never, never]), auth as never);
    const parsed = JSON.parse((await tool.invoke({})) as string);
    expect(parsed).toMatchObject({ ok: true, action: 'upload_preview', ready: true });
    expect(uploadService.patchUploadChannel).not.toHaveBeenCalled();
    expect(uploadService.publishUpload).not.toHaveBeenCalled();
  });

  it('reschedule_publish wraps updateUpload', async () => {
    const tool = createReschedulePublishTool(...(args as never as [string, never, never, never]), auth as never);
    const parsed = JSON.parse((await tool.invoke({ scheduledAt: '2030-01-01T10:00:00+07:00', timezone: 'Asia/Bangkok' })) as string);
    expect(parsed.action).toBe('rescheduled');
    expect(uploadService.updateUpload).toHaveBeenCalledWith('up1', { scheduledAt: '2030-01-01T10:00:00+07:00', timezone: 'Asia/Bangkok' }, auth);
  });

  it('cancel_schedule only cancels still-scheduled posts', async () => {
    postService.findScheduledPostsForUpload.mockResolvedValueOnce([
      { postId: 'p1', status: 'scheduled' },
      { postId: 'p2', status: 'published' },
    ]);
    const tool = createCancelScheduleTool(...(args as never as [string, never, never, never]), postService as never, auth as never);
    const parsed = JSON.parse((await tool.invoke({})) as string);
    expect(parsed.cancelledPostIds).toEqual(['p1']);
    expect(postService.deletePost).toHaveBeenCalledTimes(1);
    expect(JSON.parse((await tool.invoke({})) as string).code).toBe('no_change');
  });

  it('retry_publish retries a post by id, or the failed channels on the upload', async () => {
    const tool = createRetryPublishTool(...(args as never as [string, never, never, never]), postService as never, auth as never);
    const byPost = JSON.parse((await tool.invoke({ postId: 'post-1' })) as string);
    expect(byPost).toMatchObject({ action: 'post_retry_started', newPostId: 'post-2' });
    expect(JSON.parse((await tool.invoke({})) as string).code).toBe('no_change');
    const d = baseDetail();
    d.channels[1].status = 'failed';
    uploadService.findByUploadId.mockResolvedValue(d);
    const byUpload = JSON.parse((await tool.invoke({})) as string);
    expect(byUpload).toMatchObject({ action: 'upload_retry_started', uploadId: 'up1', channels: ['facebook'] });
    expect(uploadService.retryUpload).toHaveBeenCalledWith('up1', auth);
  });
});
