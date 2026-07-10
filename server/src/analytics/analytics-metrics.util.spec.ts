import {
  aggregateMetrics,
  extractPostAnalyticsRows,
  formatAnalyticsPullSummary,
  isAnalyticsSyncPending,
  normalizeMetrics,
} from './analytics-metrics.util';
import type { ContentPerformanceEntry } from './schemas/analytics.schema';

describe('normalizeMetrics', () => {
  it('maps common aliases and defaults', () => {
    expect(normalizeMetrics(null)).toMatchObject({
      views: 0,
      clicks: 0,
      engagement: 0,
      conversions: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      reach: 0,
    });
    expect(
      normalizeMetrics({
        impressions: 100,
        linkClicks: 5,
        totalEngagement: 20,
        reactions: 8,
        comments: 2,
        reposts: 1,
        uniqueReach: 50,
        conversions: 3,
      }),
    ).toMatchObject({
      views: 100,
      clicks: 5,
      engagement: 20,
      likes: 8,
      comments: 2,
      shares: 1,
      reach: 50,
      conversions: 3,
    });
  });

  it('unwraps Zernio analytics object', () => {
    expect(
      normalizeMetrics({
        analytics: {
          impressions: 15420,
          reach: 12350,
          likes: 342,
          comments: 28,
          shares: 45,
          clicks: 189,
        },
      }),
    ).toMatchObject({
      views: 15420,
      reach: 12350,
      likes: 342,
      comments: 28,
      shares: 45,
      clicks: 189,
      engagement: 415,
    });
  });
});

describe('isAnalyticsSyncPending', () => {
  it('detects pending syncStatus on body', () => {
    expect(isAnalyticsSyncPending({ syncStatus: 'pending' })).toBe(true);
    expect(isAnalyticsSyncPending({ syncStatus: 'synced' })).toBe(false);
  });
});

describe('extractPostAnalyticsRows', () => {
  const zernioFixture = {
    postId: '65f1c0a9e2b5af0012ab34cd',
    syncStatus: 'synced',
    analytics: {
      impressions: 1000,
      reach: 800,
      likes: 10,
      comments: 2,
      shares: 1,
      clicks: 5,
    },
    platformAnalytics: [
      {
        platform: 'instagram',
        syncStatus: 'synced',
        analytics: {
          impressions: 600,
          reach: 500,
          likes: 6,
          comments: 1,
          shares: 0,
          clicks: 3,
        },
      },
      {
        platform: 'facebook',
        syncStatus: 'synced',
        analytics: {
          impressions: 400,
          reach: 300,
          likes: 4,
          comments: 1,
          shares: 1,
          clicks: 2,
        },
      },
    ],
  };

  it('returns per-platform metrics without duplicating aggregate', () => {
    const out = extractPostAnalyticsRows(zernioFixture, [
      'instagram',
      'facebook',
    ]);
    expect(out.synced).toHaveLength(2);
    expect(out.synced[0]).toMatchObject({
      channel: 'instagram',
      metrics: { views: 600, likes: 6 },
    });
    expect(out.synced[1]).toMatchObject({
      channel: 'facebook',
      metrics: { views: 400, likes: 4 },
    });
    expect(out.pending).toEqual([]);
    expect(out.failed).toEqual([]);
    expect(out.noData).toEqual([]);
  });

  it('marks root pending as all channels pending', () => {
    const out = extractPostAnalyticsRows(
      { syncStatus: 'pending', platformAnalytics: [] },
      ['instagram'],
    );
    expect(out.synced).toHaveLength(0);
    expect(out.pending).toEqual(['instagram']);
  });

  it('uses root analytics for single-channel fallback', () => {
    const out = extractPostAnalyticsRows(
      {
        syncStatus: 'synced',
        analytics: { impressions: 200, likes: 5, reach: 100 },
        platformAnalytics: [],
      },
      ['linkedin'],
    );
    expect(out.synced).toHaveLength(1);
    expect(out.synced[0]?.channel).toBe('linkedin');
    expect(out.synced[0]?.metrics.views).toBe(200);
  });
});

describe('formatAnalyticsPullSummary', () => {
  it('formats mixed outcomes', () => {
    expect(
      formatAnalyticsPullSummary({
        postsQueried: 3,
        platformRowsSynced: 4,
        pending: 2,
        failed: 0,
        noData: 1,
      }),
    ).toBe('4 platform row(s) synced; 2 pending on Zernio; 1 with no data');
  });
});

describe('aggregateMetrics', () => {
  it('aggregates totals and picks best channel/content', () => {
    const entries: ContentPerformanceEntry[] = [
      {
        contentRef: 'c1',
        pipelineRef: 'w1',
        uploadRef: 'u1',
        zernioPostId: 'p1',
        channel: 'instagram',
        metrics: {
          views: 100,
          clicks: 10,
          engagement: 30,
          conversions: 0,
          likes: 5,
          comments: 1,
          shares: 0,
          reach: 80,
          engagementRate: 0,
        },
      },
      {
        contentRef: 'c2',
        pipelineRef: 'w1',
        uploadRef: 'u2',
        zernioPostId: 'p2',
        channel: 'facebook',
        metrics: {
          views: 50,
          clicks: 2,
          engagement: 10,
          conversions: 1,
          likes: 2,
          comments: 0,
          shares: 0,
          reach: 40,
          engagementRate: 0,
        },
      },
    ];
    const s = aggregateMetrics(entries);
    expect(s.totalViews).toBe(150);
    expect(s.totalEngagement).toBe(40);
    expect(s.bestPerformingChannel).toBe('instagram');
    expect(s.bestPerformingContent).toBe('c1');
    expect(s.totalPostsAnalyzed).toBe(2);
  });
});
