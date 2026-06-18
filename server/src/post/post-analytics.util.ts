import {
  PlatformPostStatus,
  PostStatus,
  type PlatformResult,
} from './schemas/post.schema';

export function isPostMetricsEligible(status: PostStatus): boolean {
  return status === PostStatus.Published || status === PostStatus.Partial;
}

/** Channels eligible for metrics: all channels when published; only successful platforms when partial. */
export function publishedChannelsFromPost(post: {
  status: PostStatus;
  platformResults?: PlatformResult[];
  channels?: string[];
}): string[] {
  if (post.status === PostStatus.Published) {
    return [...new Set((post.channels ?? []).map((c) => c.trim().toLowerCase()).filter(Boolean))];
  }
  if (post.status === PostStatus.Partial) {
    return [
      ...new Set(
        (post.platformResults ?? [])
          .filter((r) => r.status === PlatformPostStatus.Published)
          .map((r) => r.platform.trim().toLowerCase())
          .filter(Boolean),
      ),
    ];
  }
  return [];
}
