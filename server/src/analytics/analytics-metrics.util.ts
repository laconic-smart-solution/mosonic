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

function channelKey(channel: string): string {
  return channel.trim().toLowerCase();
}

function isPendingSyncStatus(status: unknown): boolean {
  const v = String(status ?? '')
    .trim()
    .toLowerCase();
  return v === 'pending' || v === 'syncing';
}

function isFailedSyncStatus(status: unknown): boolean {
  const v = String(status ?? '')
    .trim()
    .toLowerCase();
  return v === 'failed' || v === 'error';
}

/** True when Zernio indicates analytics are not ready yet (HTTP 202 or body syncStatus). */
export function isAnalyticsSyncPending(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  return isPendingSyncStatus((raw as Record<string, unknown>).syncStatus);
}

export function hasMeaningfulMetrics(metrics: ChannelMetrics): boolean {
  return (
    metrics.views > 0 ||
    metrics.clicks > 0 ||
    metrics.engagement > 0 ||
    metrics.likes > 0 ||
    metrics.comments > 0 ||
    metrics.shares > 0 ||
    metrics.reach > 0 ||
    metrics.conversions > 0
  );
}

/** Normalize Zernio / platform analytics JSON into {@link ChannelMetrics}. */
export function normalizeMetrics(raw: unknown): ChannelMetrics {
  const r =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const nested =
    r.analytics && typeof r.analytics === 'object'
      ? (r.analytics as Record<string, unknown>)
      : r.metrics && typeof r.metrics === 'object'
        ? (r.metrics as Record<string, unknown>)
        : r;

  const views = num(
    nested.views ?? nested.impressions ?? r.views ?? r.impressions,
  );
  const clicks = num(
    nested.clicks ?? nested.linkClicks ?? r.clicks ?? r.linkClicks,
  );
  const likes = num(nested.likes ?? nested.reactions ?? r.likes ?? r.reactions);
  const comments = num(nested.comments ?? r.comments);
  const shares = num(nested.shares ?? nested.reposts ?? r.shares ?? r.reposts);
  const reach = num(
    nested.reach ?? nested.uniqueReach ?? r.reach ?? r.uniqueReach,
  );
  const conversions = num(nested.conversions ?? r.conversions);
  let engagement = num(
    nested.engagement ??
      nested.totalEngagement ??
      r.engagement ??
      r.totalEngagement,
  );
  if (engagement === 0 && (likes > 0 || comments > 0 || shares > 0)) {
    engagement = likes + comments + shares;
  }
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

export type PostAnalyticsExtractResult = {
  synced: Array<{ channel: string; metrics: ChannelMetrics }>;
  pending: string[];
  failed: string[];
  noData: string[];
};

/**
 * Map a Zernio single-post analytics response to per-channel rows for our stores.
 * Uses `platformAnalytics[]` when present; falls back to root `analytics` for single-channel posts.
 */
export function extractPostAnalyticsRows(
  raw: unknown,
  channels: string[],
): PostAnalyticsExtractResult {
  const result: PostAnalyticsExtractResult = {
    synced: [],
    pending: [],
    failed: [],
    noData: [],
  };

  const requested = [
    ...new Set(channels.map(channelKey).filter((c) => c.length > 0)),
  ];
  if (requested.length === 0) return result;

  if (!raw || typeof raw !== 'object') {
    result.noData.push(...requested);
    return result;
  }

  const root = raw as Record<string, unknown>;
  if (isPendingSyncStatus(root.syncStatus)) {
    result.pending.push(...requested);
    return result;
  }

  const platformAnalytics = Array.isArray(root.platformAnalytics)
    ? root.platformAnalytics
    : [];
  const byPlatform = new Map<string, Record<string, unknown>>();
  for (const item of platformAnalytics) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const plat = channelKey(String(row.platform ?? ''));
    if (plat) byPlatform.set(plat, row);
  }

  for (const ch of requested) {
    const platRow = byPlatform.get(ch);
    if (platRow) {
      if (isPendingSyncStatus(platRow.syncStatus)) {
        result.pending.push(ch);
        continue;
      }
      if (isFailedSyncStatus(platRow.syncStatus)) {
        result.failed.push(ch);
        continue;
      }
      const analytics = platRow.analytics;
      if (analytics && typeof analytics === 'object') {
        const metrics = normalizeMetrics(analytics);
        if (hasMeaningfulMetrics(metrics)) {
          result.synced.push({ channel: ch, metrics });
          continue;
        }
      }
      result.noData.push(ch);
      continue;
    }

    if (
      requested.length === 1 &&
      root.analytics &&
      typeof root.analytics === 'object'
    ) {
      const metrics = normalizeMetrics(root.analytics);
      if (hasMeaningfulMetrics(metrics)) {
        result.synced.push({ channel: ch, metrics });
        continue;
      }
    }

    result.noData.push(ch);
  }

  return result;
}

export type AnalyticsPullSummary = {
  postsQueried: number;
  platformRowsSynced: number;
  pending: number;
  failed: number;
  noData: number;
};

export function formatAnalyticsPullSummary(
  summary: AnalyticsPullSummary,
): string {
  const parts: string[] = [];
  if (summary.platformRowsSynced > 0) {
    parts.push(`${summary.platformRowsSynced} platform row(s) synced`);
  }
  if (summary.pending > 0) {
    parts.push(`${summary.pending} pending on Zernio`);
  }
  if (summary.failed > 0) {
    parts.push(`${summary.failed} failed`);
  }
  if (summary.noData > 0) {
    parts.push(`${summary.noData} with no data`);
  }
  return parts.length > 0 ? parts.join('; ') : 'No analytics data returned';
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
