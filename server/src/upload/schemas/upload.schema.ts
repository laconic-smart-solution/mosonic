import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { randomUUID } from 'node:crypto';
import {
  ContentOutputs,
  ContentOutputsSchema,
} from '../../content/schemas/content.schema';

export enum UploadChannelStatus {
  Pending = 'pending',
  Publishing = 'publishing',
  Scheduled = 'scheduled',
  Published = 'published',
  Failed = 'failed',
  Skipped = 'skipped',
}

/** Aggregate upload job status across channels. */
export enum UploadJobStatus {
  Pending = 'pending',
  Running = 'running',
  Partial = 'partial',
  Completed = 'completed',
  Failed = 'failed',
}

@Schema({ _id: false })
export class UploadChannelEntry {
  @Prop({ required: true })
  channel: string;

  /**
   * Whether this channel should be included by default when publishing the upload.
   * Persisted so user choices are remembered across sessions.
   */
  @Prop({ type: Boolean, required: true, default: true })
  included: boolean;

  /** Single source of truth for post caption (initialized from rule mapping; user edits via PATCH). */
  @Prop({ type: String, default: '' })
  caption: string;

  /** Primary / single-asset media URL. */
  @Prop({ type: String, default: null })
  mediaUrl: string | null;

  /** Carousel image URLs (first aligns with mediaUrl when applicable). */
  @Prop({ type: [String], default: [] })
  mediaUrls: string[];

  @Prop({ type: String, default: null })
  youtubeTitle: string | null;

  @Prop({
    type: String,
    enum: Object.values(UploadChannelStatus),
    required: true,
    default: UploadChannelStatus.Pending,
  })
  status: UploadChannelStatus;

  @Prop({ type: String, default: null })
  zernioPostId: string | null;

  @Prop({ type: Date, default: null })
  scheduledAt: Date | null;

  @Prop({ type: Date, default: null })
  publishedAt: Date | null;

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  retryCount: number;

  @Prop({ type: String, default: null })
  failureReason: string | null;
}
export const UploadChannelEntrySchema =
  SchemaFactory.createForClass(UploadChannelEntry);

@Schema({
  collection: 'uploads',
  timestamps: true,
})
export class Upload {
  @Prop({
    type: String,
    required: true,
    unique: true,
    default: () => randomUUID(),
  })
  uploadId: string;

  /** App-local tenant id (`User.userId`); legacy rows may omit. */
  @Prop({ type: String, index: true })
  userId?: string;

  @Prop({ required: true, index: true })
  contentRef: string;

  @Prop({ required: true, index: true })
  workflowRef: string;

  @Prop({ required: true, index: true })
  ruleRef: string;

  @Prop({ type: [UploadChannelEntrySchema], default: [] })
  channels: UploadChannelEntry[];

  @Prop({
    type: String,
    enum: Object.values(UploadJobStatus),
    required: true,
    default: UploadJobStatus.Pending,
  })
  status: UploadJobStatus;

  /** Snapshot at approve time (merged user + AI outputs). */
  @Prop({ type: ContentOutputsSchema, required: false })
  resolvedOutputs?: ContentOutputs;
}

export const UploadSchema = SchemaFactory.createForClass(Upload);

UploadSchema.index({ contentRef: 1, status: 1 });
UploadSchema.index({ userId: 1, createdAt: -1 });
UploadSchema.index({ 'channels.zernioPostId': 1 });
/** Supports cron scans for embedded scheduled channels with Zernio ids (multikey compound). */
UploadSchema.index({
  'channels.status': 1,
  'channels.zernioPostId': 1,
});
export type UploadDocument = HydratedDocument<Upload>;
