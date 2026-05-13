import type {
  AnalyticsPeriod,
  CampaignSummary,
  ContentPerformanceEntry,
  FeedbackSignal,
} from '../schemas/analytics.schema';

/** Single analytics document as returned by API. */
export type AnalyticsSnapshotDto = {
  analyticsId: string;
  ruleRef: string;
  period: AnalyticsPeriod;
  pulledAt: string;
  contentPerformance: ContentPerformanceEntry[];
  campaignSummary: CampaignSummary;
  feedbackSignal: FeedbackSignal;
  createdAt?: string;
};

export type AnalyticsListItemDto = {
  ruleRef: string;
  ruleName: string;
  latest: AnalyticsSnapshotDto | null;
  pendingSuggestionCount: number;
};

export type AnalyticsListResponseDto = {
  analytics: AnalyticsListItemDto[];
  total: number;
  totalPendingSuggestions: number;
  page: number;
  limit: number;
};

export type AnalyticsDisplayMapsDto = {
  contentByRef: Record<string, { title: string }>;
  uploadByRef: Record<string, { label: string }>;
};

export type AnalyticsLatestResponseDto = {
  ruleName: string;
  analytics: AnalyticsSnapshotDto | null;
  display: AnalyticsDisplayMapsDto;
};
