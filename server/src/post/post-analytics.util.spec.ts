import {
  publishedChannelsFromPost,
  isPostMetricsEligible,
} from './post-analytics.util';
import {
  PlatformPostStatus,
  PostStatus,
} from './schemas/post.schema';

describe('post-analytics.util', () => {
  it('isPostMetricsEligible accepts published and partial', () => {
    expect(isPostMetricsEligible(PostStatus.Published)).toBe(true);
    expect(isPostMetricsEligible(PostStatus.Partial)).toBe(true);
    expect(isPostMetricsEligible(PostStatus.Scheduled)).toBe(false);
  });

  it('publishedChannelsFromPost returns only successful platforms for partial', () => {
    const channels = publishedChannelsFromPost({
      status: PostStatus.Partial,
      channels: ['instagram', 'facebook'],
      platformResults: [
        { platform: 'instagram', status: PlatformPostStatus.Published },
        { platform: 'facebook', status: PlatformPostStatus.Failed },
      ],
    });
    expect(channels).toEqual(['instagram']);
  });
});
