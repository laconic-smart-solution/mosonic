import type {
  IntelligencePerformanceHint,
  IntelligenceSuggestionHint,
} from '../nodes/types/node-execution.types';
import type { AnalyticsDocument } from './schemas/analytics.schema';
import { FeedbackSignalStatus } from './schemas/analytics.schema';

export function buildIntelligenceContextFromAnalytics(
  analytics: AnalyticsDocument | null,
): {
  topPerformers: IntelligencePerformanceHint[];
  bottomPerformers: IntelligencePerformanceHint[];
  pendingSuggestions: IntelligenceSuggestionHint[];
} {
  const entries = analytics?.contentPerformance ?? [];
  const ranked = [...entries].sort(
    (a, b) =>
      (b.metrics?.engagementRate ?? 0) - (a.metrics?.engagementRate ?? 0),
  );
  const toHint = (
    e: (typeof entries)[number],
  ): IntelligencePerformanceHint => ({
    channel: e.channel,
    contentRef: e.contentRef,
    engagementRate: e.metrics?.engagementRate ?? 0,
    views: e.metrics?.views ?? 0,
  });

  const topPerformers = ranked.slice(0, 3).map(toHint);
  const bottomPerformers = ranked
    .slice(-3)
    .reverse()
    .map(toHint);

  const pendingSuggestions: IntelligenceSuggestionHint[] = (
    analytics?.feedbackSignal?.suggestions ?? []
  )
    .filter((s) => s.status === FeedbackSignalStatus.Pending)
    .slice(0, 5)
    .map((s) => ({
      field: s.field,
      suggestedValue: s.suggestedValue,
      reason: s.reason,
      confidence: s.confidence,
    }));

  return { topPerformers, bottomPerformers, pendingSuggestions };
}
