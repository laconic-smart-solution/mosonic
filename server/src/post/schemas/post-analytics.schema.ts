import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  ChannelMetrics,
  ChannelMetricsSchema,
} from '../../analytics/schemas/analytics.schema';

export enum PostAnalyticsSyncStatus {
  Pending = 'pending',
  Synced = 'synced',
  Partial = 'partial',
  Unavailable = 'unavailable',
}

export enum PlatformMetricSyncStatus {
  Pending = 'pending',
  Synced = 'synced',
  Failed = 'failed',
  Unavailable = 'unavailable',
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
export class PlatformMetricEntry {
  @Prop({ required: true })
  platform: string;

  @Prop({ type: ChannelMetricsSchema, default: null })
  metrics: ChannelMetrics | null;

  @Prop({
    type: String,
    enum: Object.values(PlatformMetricSyncStatus),
    required: true,
    default: PlatformMetricSyncStatus.Pending,
  })
  syncStatus: PlatformMetricSyncStatus;

  @Prop({ type: String, default: null })
  platformPostUrl: string | null;

  @Prop({ type: String, default: null })
  errorMessage: string | null;
}
export const PlatformMetricEntrySchema =
  SchemaFactory.createForClass(PlatformMetricEntry);

@Schema({
  collection: 'post_analytics',
  timestamps: { createdAt: true, updatedAt: true },
})
export class PostAnalytics {
  @Prop({ required: true, unique: true, index: true })
  postId: string;

  @Prop({ required: true, index: true })
  zernioPostId: string;

  @Prop({ required: true, index: true })
  ruleRef: string;

  @Prop({ required: true, index: true })
  userId: string;

  @Prop({
    type: String,
    enum: Object.values(PostAnalyticsSyncStatus),
    required: true,
    default: PostAnalyticsSyncStatus.Pending,
  })
  syncStatus: PostAnalyticsSyncStatus;

  @Prop({ type: Date, required: true })
  pulledAt: Date;

  @Prop({ type: AnalyticsPeriodSchema, required: true })
  period: AnalyticsPeriod;

  @Prop({ type: [PlatformMetricEntrySchema], default: [] })
  platformMetrics: PlatformMetricEntry[];
}

export const PostAnalyticsSchema = SchemaFactory.createForClass(PostAnalytics);
export type PostAnalyticsDocument = HydratedDocument<PostAnalytics>;

PostAnalyticsSchema.index({ ruleRef: 1, pulledAt: -1 });
