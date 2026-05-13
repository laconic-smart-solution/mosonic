import { aggregateMetrics, normalizeMetrics } from './analytics-metrics.util';
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
