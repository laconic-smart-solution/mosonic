import type {
  CampaignSummary,
  ChannelMetrics,
  ContentPerformanceEntry,
} from './schemas/analytics.schema';

function num(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, v);
  if (typeof v === 'string' && v.trim() && !Number.isNaN(Number(v))) {
    return Math.max(0, Number(v));
  }
  return fallback;
}

/** Normalize Zernio / platform analytics JSON into {@link ChannelMetrics}. */
export function normalizeMetrics(raw: unknown): ChannelMetrics {
  const r =
    raw && typeof raw === 'object'
      ? (raw as Record<string, unknown>)
      : {};
  const nested =
    r.metrics && typeof r.metrics === 'object'
      ? (r.metrics as Record<string, unknown>)
      : r;

  const views = num(
    nested.views ?? nested.impressions ?? r.views ?? r.impressions,
  );
  const clicks = num(
    nested.clicks ?? nested.linkClicks ?? r.clicks ?? r.linkClicks,
  );
  const engagement = num(
    nested.engagement ??
      nested.totalEngagement ??
      r.engagement ??
      r.totalEngagement,
  );
  const likes = num(
    nested.likes ?? nested.reactions ?? r.likes ?? r.reactions,
  );
  const comments = num(nested.comments ?? r.comments);
  const shares = num(nested.shares ?? nested.reposts ?? r.shares ?? r.reposts);
  const reach = num(nested.reach ?? nested.uniqueReach ?? r.reach ?? r.uniqueReach);
  const conversions = num(nested.conversions ?? r.conversions);
  const engagementRate = num(
    nested.engagementRate ?? r.engagementRate,
    reach > 0 ? (engagement / reach) * 100 : 0,
  );

  return {
    views,
    clicks,
    engagement,
    conversions,
    likes,
    comments,
    shares,
    reach,
    engagementRate: Math.round(engagementRate * 100) / 100,
  };
}

export function aggregateMetrics(
  entries: ContentPerformanceEntry[],
): CampaignSummary {
  if (entries.length === 0) {
    return {
      totalViews: 0,
      totalClicks: 0,
      totalEngagement: 0,
      totalConversions: 0,
      totalLikes: 0,
      totalComments: 0,
      totalShares: 0,
      totalReach: 0,
      averageEngagementRate: 0,
      totalPostsAnalyzed: 0,
      bestPerformingChannel: '',
      bestPerformingContent: '',
    };
  }

  const totals = entries.reduce(
    (acc, e) => ({
      totalViews: acc.totalViews + e.metrics.views,
      totalClicks: acc.totalClicks + e.metrics.clicks,
      totalEngagement: acc.totalEngagement + e.metrics.engagement,
      totalLikes: acc.totalLikes + e.metrics.likes,
      totalComments: acc.totalComments + e.metrics.comments,
      totalShares: acc.totalShares + e.metrics.shares,
      totalReach: acc.totalReach + e.metrics.reach,
      totalConversions: acc.totalConversions + e.metrics.conversions,
    }),
    {
      totalViews: 0,
      totalClicks: 0,
      totalEngagement: 0,
      totalLikes: 0,
      totalComments: 0,
      totalShares: 0,
      totalReach: 0,
      totalConversions: 0,
    },
  );

  const channelMap = new Map<string, number>();
  for (const e of entries) {
    const k = e.channel.trim().toLowerCase();
    channelMap.set(k, (channelMap.get(k) ?? 0) + e.metrics.engagement);
  }
  const bestChannel =
    [...channelMap.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';

  const contentMap = new Map<string, number>();
  for (const e of entries) {
    contentMap.set(
      e.contentRef,
      (contentMap.get(e.contentRef) ?? 0) + e.metrics.engagement,
    );
  }
  const bestContent =
    [...contentMap.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';

  const averageEngagementRate =
    totals.totalReach > 0
      ? (totals.totalEngagement / totals.totalReach) * 100
      : 0;

  return {
    ...totals,
    averageEngagementRate: Math.round(averageEngagementRate * 100) / 100,
    totalPostsAnalyzed: entries.length,
    bestPerformingChannel: bestChannel,
    bestPerformingContent: bestContent,
  };
}
