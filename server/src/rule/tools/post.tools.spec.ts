import {
  createGetPostAnalyticsTool,
  createGetPostTool,
  createListPostsTool,
} from './post.tools';
import { PostStatus } from '../../post/schemas/post.schema';

const auth = { userId: 'u1', role: 'CUSTOMER' } as const;

describe('post.tools', () => {
  const postService = {
    listPosts: jest.fn().mockResolvedValue({
      posts: [
        {
          postId: 'post-1',
          status: PostStatus.Published,
          channels: ['tiktok'],
          contentRef: 'c1',
          captionPreview: 'Hello',
        },
      ],
      total: 1,
      page: 1,
      totalPages: 1,
    }),
    getPostDetail: jest.fn().mockResolvedValue({
      postId: 'post-1',
      status: PostStatus.Published,
      channels: ['tiktok'],
      analytics: { postId: 'post-1', platformMetrics: [] },
    }),
    syncPostAnalytics: jest.fn().mockResolvedValue({
      analytics: { postId: 'post-1', platformMetrics: [{ platform: 'tiktok' }] },
    }),
    retryPost: jest.fn().mockResolvedValue({ newPostId: 'post-2' }),
  };

  beforeEach(() => jest.clearAllMocks());

  it('list_posts scopes to ruleRef', async () => {
    const tool = createListPostsTool('r1', postService as never, auth as never);
    const raw = await tool.invoke({ status: PostStatus.Published });
    const parsed = JSON.parse(raw as string);
    expect(parsed.ok).toBe(true);
    expect(parsed.posts[0].postId).toBe('post-1');
    expect(postService.listPosts).toHaveBeenCalledWith(
      auth,
      expect.objectContaining({ ruleRef: 'r1' }),
    );
  });

  it('get_post returns compact detail', async () => {
    const tool = createGetPostTool(postService as never, auth as never);
    const raw = await tool.invoke({ postId: 'post-1' });
    const parsed = JSON.parse(raw as string);
    expect(parsed.action).toBe('show_post');
    expect(parsed.post.postId).toBe('post-1');
  });

  it('get_post_analytics can refresh', async () => {
    const tool = createGetPostAnalyticsTool(
      postService as never,
      auth as never,
    );
    const raw = await tool.invoke({ postId: 'post-1', refresh: true });
    const parsed = JSON.parse(raw as string);
    expect(parsed.refreshed).toBe(true);
    expect(postService.syncPostAnalytics).toHaveBeenCalledWith('post-1', auth);
  });
});
