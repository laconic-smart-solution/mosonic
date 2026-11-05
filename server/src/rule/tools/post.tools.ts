import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { TenancyAuth } from '../../auth/tenancy.types';
import type { PostService } from '../../post/post.service';
import { PostStatus } from '../../post/schemas/post.schema';
import { runTool, toolOk } from './tool-error.util';

const LIST_POSTS_SCHEMA = z.object({
  status: z
    .enum([
      PostStatus.Pending,
      PostStatus.Scheduled,
      PostStatus.Published,
      PostStatus.Failed,
      PostStatus.Cancelled,
      PostStatus.Partial,
    ])
    .optional()
    .describe('Optional status filter.'),
  channel: z.string().optional().describe('Optional channel filter.'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe('Max rows (default 10).'),
  page: z.number().int().min(1).max(50).optional().describe('Page number (default 1). Use with hasMore from the previous result.'),
});

function compactPost(row: Record<string, unknown>) {
  return {
    postId: String(row.postId ?? ''),
    status: String(row.status ?? ''),
    channels: Array.isArray(row.channels) ? row.channels : [],
    contentRef: row.contentRef ? String(row.contentRef) : null,
    uploadRef: row.uploadRef ? String(row.uploadRef) : null,
    scheduledAt: row.scheduledAt ? String(row.scheduledAt) : null,
    publishedAt: row.publishedAt ? String(row.publishedAt) : null,
    failureReason: row.failureReason ? String(row.failureReason) : null,
    captionPreview:
      typeof row.captionPreview === 'string'
        ? row.captionPreview.slice(0, 160)
        : null,
  };
}

export function createListPostsTool(
  ruleId: string,
  postService: PostService,
  auth: TenancyAuth,
) {
  return tool(
    async ({ status, channel, limit, page }) =>
      runTool(async () => {
        const result = await postService.listPosts(auth, {
          page: page ?? 1,
          limit: limit ?? 10,
          status,
          channel,
          ruleRef: ruleId,
        });
        const posts = (result.posts as Record<string, unknown>[]).map(
          compactPost,
        );
        return toolOk({
          action: 'list_posts',
          total: result.total,
          page: page ?? 1,
          hasMore: (page ?? 1) * (limit ?? 10) < Number(result.total ?? 0),
          posts,
        });
      }),
    {
      name: 'list_posts',
      description:
        'List published/scheduled/failed posts for this brand. Use to check what went out or find a postId for analytics/retry_publish. Paged: pass page for older posts.',
      schema: LIST_POSTS_SCHEMA,
    },
  );
}

export function createGetPostTool(
  postService: PostService,
  auth: TenancyAuth,
) {
  return tool(
    async ({ postId }) =>
      runTool(async () => {
        const detail = await postService.getPostDetail(postId, auth);
        const local =
          detail && typeof detail === 'object' && 'local' in detail
            ? (detail.local as Record<string, unknown>)
            : (detail as Record<string, unknown>);
        const analytics =
          detail && typeof detail === 'object' && 'analytics' in detail
            ? detail.analytics
            : undefined;
        return toolOk({
          action: 'show_post',
          post: compactPost(local),
          analytics: analytics ?? null,
        });
      }),
    {
      name: 'get_post',
      description: 'Get one published post by postId (status, channels, stored analytics if any).',
      schema: z.object({
        postId: z.string().min(1).describe('Post id from list_posts.'),
      }),
    },
  );
}

export function createGetPostAnalyticsTool(
  postService: PostService,
  auth: TenancyAuth,
) {
  return tool(
    async ({ postId, refresh }) =>
      runTool(async () => {
        if (refresh) {
          const synced = await postService.syncPostAnalytics(postId, auth);
          return toolOk({
            action: 'post_analytics',
            postId,
            refreshed: true,
            analytics: synced.analytics,
          });
        }
        const detail = await postService.getPostDetail(postId, auth);
        const analytics =
          detail && typeof detail === 'object' && 'analytics' in detail
            ? detail.analytics
            : null;
        return toolOk({
          action: 'post_analytics',
          postId,
          refreshed: false,
          analytics,
        });
      }),
    {
      name: 'get_post_analytics',
      description:
        'Get metrics for a published post. Set refresh=true to pull fresh numbers from the platform.',
      schema: z.object({
        postId: z.string().min(1),
        refresh: z
          .boolean()
          .optional()
          .describe('When true, sync from Zernio before returning.'),
      }),
    },
  );
}
