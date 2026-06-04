import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';
import { randomUUID } from 'node:crypto';

/** Workflow on AI-generated rule / channel tweak suggestions. */
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

@Schema({ _id: false })
export class AnalyticsPeriod {
  @Prop({ type: Date, required: true })
  from: Date;

  @Prop({ type: Date, required: true })
  to: Date;
}
export const AnalyticsPeriodSchema =
  SchemaFactory.createForClass(AnalyticsPeriod);

@Schema({ _id: false })
export class ChannelMetrics {
  @Prop({ required: true, min: 0 })
  views: number;

  @Prop({ required: true, min: 0 })
  clicks: number;

  @Prop({ required: true, min: 0 })
  engagement: number;

  @Prop({ required: true, min: 0 })
  conversions: number;

  @Prop({ required: true, min: 0, default: 0 })
  likes: number;

  @Prop({ required: true, min: 0, default: 0 })
  comments: number;

  @Prop({ required: true, min: 0, default: 0 })
  shares: number;

  @Prop({ required: true, min: 0, default: 0 })
  reach: number;

  @Prop({ required: true, min: 0, default: 0 })
  engagementRate: number;
}
export const ChannelMetricsSchema =
  SchemaFactory.createForClass(ChannelMetrics);

@Schema({ _id: false })
export class ContentPerformanceEntry {
  @Prop({ required: true })
  contentRef: string;

  @Prop({ required: true })
  pipelineRef: string;

  @Prop({ required: true })
  uploadRef: string;

  @Prop({ required: true })
  zernioPostId: string;

  @Prop({ required: true })
  channel: string;

  @Prop({ type: String, default: null })
  variantId?: string | null;

  @Prop({ type: String, default: null })
  experimentId?: string | null;

  @Prop({ type: ChannelMetricsSchema, required: true })
  metrics: ChannelMetrics;
}
export const ContentPerformanceEntrySchema = SchemaFactory.createForClass(
  ContentPerformanceEntry,
);

@Schema({ _id: false })
export class CampaignSummary {
  @Prop({ required: true, min: 0 })
  totalViews: number;

  @Prop({ required: true, min: 0 })
  totalClicks: number;

  @Prop({ required: true, min: 0 })
  totalEngagement: number;

  @Prop({ required: true, min: 0 })
  totalConversions: number;

  @Prop({ required: true, min: 0, default: 0 })
  totalLikes: number;

  @Prop({ required: true, min: 0, default: 0 })
  totalComments: number;

  @Prop({ required: true, min: 0, default: 0 })
  totalShares: number;

  @Prop({ required: true, min: 0, default: 0 })
  totalReach: number;

  @Prop({ required: true, default: 0 })
  averageEngagementRate: number;

  @Prop({ required: true, min: 0, default: 0 })
  totalPostsAnalyzed: number;

  @Prop({ type: String, default: '' })
  bestPerformingChannel: string;

  @Prop({ type: String, default: '' })
  bestPerformingContent: string;
}
export const CampaignSummarySchema =
  SchemaFactory.createForClass(CampaignSummary);

@Schema({ _id: false })
export class FeedbackSuggestion {
  @Prop({ required: true })
  field: string;

  /** JSON path value — string, string[], number, etc. */
  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  currentValue: unknown;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  suggestedValue: unknown;

  @Prop({ required: true })
  reason: string;

  @Prop({
    type: String,
    enum: Object.values(SuggestionConfidence),
    required: true,
    default: SuggestionConfidence.Medium,
  })
  confidence: SuggestionConfidence;

  @Prop({
    type: String,
    enum: Object.values(FeedbackSignalStatus),
    required: true,
    default: FeedbackSignalStatus.Pending,
  })
  status: FeedbackSignalStatus;
}
export const FeedbackSuggestionSchema =
  SchemaFactory.createForClass(FeedbackSuggestion);

@Schema({ _id: false })
export class FeedbackSignal {
  @Prop({ type: [FeedbackSuggestionSchema], default: [] })
  suggestions: FeedbackSuggestion[];
}
export const FeedbackSignalSchema =
  SchemaFactory.createForClass(FeedbackSignal);

/**
 * Live analytics document for a rule. One document per rule, updated in place
 * by sync (`pullAnalyticsForRule`) and by suggestion generation.
 */
@Schema({
  collection: 'analytics',
  timestamps: { createdAt: true, updatedAt: true },
})
export class Analytics {
  @Prop({
    type: String,
    required: true,
    unique: true,
    default: () => randomUUID(),
  })
  analyticsId: string;

  @Prop({ required: true, unique: true })
  ruleRef: string;

  @Prop({ type: AnalyticsPeriodSchema, required: true })
  period: AnalyticsPeriod;

  @Prop({ type: Date, required: true })
  pulledAt: Date;

  @Prop({ type: [ContentPerformanceEntrySchema], default: [] })
  contentPerformance: ContentPerformanceEntry[];

  @Prop({ type: CampaignSummarySchema, required: true })
  campaignSummary: CampaignSummary;

  @Prop({ type: FeedbackSignalSchema, required: true })
  feedbackSignal: FeedbackSignal;
}

export const AnalyticsSchema = SchemaFactory.createForClass(Analytics);
export type AnalyticsDocument = HydratedDocument<Analytics>;

AnalyticsSchema.index({ 'period.from': 1, 'period.to': 1 });
