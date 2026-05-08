import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';
import { randomUUID } from 'node:crypto';

/** Workflow on AI-generated rule / channel tweak suggestions. */
export enum FeedbackSignalStatus {
  Pending = 'pending',
  Applied = 'applied',
  Rejected = 'rejected',
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
  channel: string;

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

  @Prop({ required: true })
  bestPerformingChannel: string;

  @Prop({ required: true })
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
}
export const FeedbackSuggestionSchema =
  SchemaFactory.createForClass(FeedbackSuggestion);

@Schema({ _id: false })
export class FeedbackSignal {
  @Prop({ type: [FeedbackSuggestionSchema], default: [] })
  suggestions: FeedbackSuggestion[];

  @Prop({
    type: String,
    enum: Object.values(FeedbackSignalStatus),
    required: true,
    default: FeedbackSignalStatus.Pending,
  })
  status: FeedbackSignalStatus;
}
export const FeedbackSignalSchema =
  SchemaFactory.createForClass(FeedbackSignal);

/**
 * Pulled analytics snapshot for a rule/workflow over a date window.
 * Immutable-style reports (no `updatedAt` per product spec).
 */
@Schema({
  collection: 'analytics',
  timestamps: { createdAt: true, updatedAt: false },
})
export class Analytics {
  @Prop({
    type: String,
    required: true,
    unique: true,
    default: () => randomUUID(),
  })
  analyticsId: string;

  @Prop({ required: true, index: true })
  ruleRef: string;

  @Prop({ required: true, index: true })
  workflowRef: string;

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

AnalyticsSchema.index({ ruleRef: 1, workflowRef: 1, pulledAt: -1 });
AnalyticsSchema.index({ 'period.from': 1, 'period.to': 1 });
