/** Mirrors server analytics API shapes (serialised dates as ISO strings). */

export type ChannelMetrics = {
  views: number
  clicks: number
  engagement: number
  conversions: number
  likes: number
  comments: number
  shares: number
  reach: number
  engagementRate: number
}

export type ContentPerformanceEntry = {
  contentRef: string
  pipelineRef: string
  uploadRef: string
  zernioPostId: string
  channel: string
  variantId?: string | null
  experimentId?: string | null
  metrics: ChannelMetrics
}

export type CampaignSummary = {
  totalViews: number
  totalClicks: number
  totalEngagement: number
  totalConversions: number
  totalLikes: number
  totalComments: number
  totalShares: number
  totalReach: number
  averageEngagementRate: number
  totalPostsAnalyzed: number
  bestPerformingChannel: string
  bestPerformingContent: string
}

export type FeedbackSuggestionStatus = "pending" | "applied" | "rejected"
export type SuggestionConfidence = "high" | "medium" | "low"

export type FeedbackSuggestion = {
  field: string
  currentValue: unknown
  suggestedValue: unknown
  reason: string
  confidence: SuggestionConfidence
  status: FeedbackSuggestionStatus
}

export type FeedbackSignal = {
  suggestions: FeedbackSuggestion[]
}

export type AnalyticsSnapshot = {
  analyticsId: string
  ruleRef: string
  period: { from: string; to: string }
  pulledAt: string
  contentPerformance: ContentPerformanceEntry[]
  campaignSummary: CampaignSummary
  feedbackSignal: FeedbackSignal
  createdAt?: string
}

export type AnalyticsListItem = {
  ruleRef: string
  ruleName: string
  latest: AnalyticsSnapshot | null
  pendingSuggestionCount: number
}

export type AnalyticsListResponse = {
  analytics: AnalyticsListItem[]
  total: number
  totalPendingSuggestions: number
  page: number
  limit: number
}

export type AnalyticsDisplayMaps = {
  contentByRef: Record<string, { title: string }>
  uploadByRef: Record<string, { label: string }>
}

export type AnalyticsLatestResponse = {
  ruleName: string
  analytics: AnalyticsSnapshot | null
  display: AnalyticsDisplayMaps
}
