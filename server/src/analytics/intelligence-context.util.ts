import type {
  IntelligencePerformanceHint,
  IntelligenceSuggestionHint,
} from '../nodes/types/node-execution.types';
import type { ChannelMetrics } from './schemas/analytics.schema';

export type PostMetricRow = {
  channel: string;
  contentRef: string;
  metrics: ChannelMetrics;
};

export function buildIntelligenceContextFromPostMetrics(
  entries: PostMetricRow[],
): {
  topPerformers: IntelligencePerformanceHint[];
  bottomPerformers: IntelligencePerformanceHint[];
  pendingSuggestions: IntelligenceSuggestionHint[];
} {
  const ranked = [...entries].sort(
    (a, b) =>
      (b.metrics?.engagementRate ?? 0) - (a.metrics?.engagementRate ?? 0),
  );
  const toHint = (e: PostMetricRow): IntelligencePerformanceHint => ({
    channel: e.channel,
    contentRef: e.contentRef,
    engagementRate: e.metrics?.engagementRate ?? 0,
    views: e.metrics?.views ?? 0,
  });

  return {
    topPerformers: ranked.slice(0, 3).map(toHint),
    bottomPerformers: ranked.slice(-3).reverse().map(toHint),
    pendingSuggestions: [],
  };
}
