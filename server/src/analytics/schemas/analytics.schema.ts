export enum FeedbackSignalStatus {
  Pending = 'pending',
  Applied = 'applied',
  Rejected = 'rejected',
}

export enum SuggestionConfidence {
  High = 'high',
  Medium = 'medium',
  Low = 'low',
}

export interface AnalyticsPeriod {
  from: Date;
  to: Date;
}

export interface ChannelMetrics {
  views: number;
  clicks: number;
  engagement: number;
  conversions: number;
  likes: number;
  comments: number;
  shares: number;
  reach: number;
  engagementRate: number;
}

export interface ContentPerformanceEntry {
  contentRef: string;
  pipelineRef: string;
  uploadRef: string;
  zernioPostId: string;
  channel: string;
  variantId?: string | null;
  experimentId?: string | null;
  metrics: ChannelMetrics;
}

export interface CampaignSummary {
  totalViews: number;
  totalClicks: number;
  totalEngagement: number;
  totalConversions: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalReach: number;
  averageEngagementRate: number;
  totalPostsAnalyzed: number;
  bestPerformingChannel: string;
  bestPerformingContent: string;
}

export interface FeedbackSuggestion {
  field: string;
  currentValue: unknown;
  suggestedValue: unknown;
  reason: string;
  confidence: SuggestionConfidence;
  status: FeedbackSignalStatus;
}

export interface FeedbackSignal {
  suggestions: FeedbackSuggestion[];
}

export interface Analytics {
  analyticsId: string;
  ruleRef: string;
  period: AnalyticsPeriod;
  pulledAt: Date;
  contentPerformance: ContentPerformanceEntry[];
  campaignSummary: CampaignSummary;
  feedbackSignal: FeedbackSignal;
  createdAt?: Date;
  updatedAt?: Date;
}

export type AnalyticsDocument = Analytics;
