import {
  PlatformPostStatus,
  PostStatus,
  type PlatformResult,
} from './schemas/post.schema';

/** Channels that publish outside Zernio and have no metrics API in Mosonic. */
const ANALYTICS_UNSUPPORTED_CHANNELS = new Set(['rednote']);

export function supportsAnalyticsChannel(channel: string): boolean {
  const key = channel.trim().toLowerCase();
  return Boolean(key) && !ANALYTICS_UNSUPPORTED_CHANNELS.has(key);
}

export function isPostMetricsEligible(status: PostStatus): boolean {
  return status === PostStatus.Published || status === PostStatus.Partial;
}

/** Channels eligible for metrics: all channels when published; only successful platforms when partial. */
export function publishedChannelsFromPost(post: {
  status: PostStatus;
  platformResults?: PlatformResult[];
  channels?: string[];
}): string[] {
  let raw: string[] = [];
  if (post.status === PostStatus.Published) {
    raw = (post.channels ?? [])
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean);
  } else if (post.status === PostStatus.Partial) {
    raw = (post.platformResults ?? [])
      .filter((r) => r.status === PlatformPostStatus.Published)
      .map((r) => r.platform.trim().toLowerCase())
      .filter(Boolean);
  }
  return [...new Set(raw.filter(supportsAnalyticsChannel))];
}
