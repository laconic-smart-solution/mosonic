import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { randomUUID } from 'node:crypto';
import {
  ContentOutputs,
  ContentOutputsSchema,
} from '../../content/schemas/content.schema';

/** Per-channel publish row inside an upload batch. */
export enum UploadChannelStatus {
  Pending = 'pending',
  Scheduled = 'scheduled',
  Published = 'published',
  Failed = 'failed',
}

/** Aggregate upload job status across channels. */
export enum UploadJobStatus {
  Pending = 'pending',
  Partial = 'partial',
  Completed = 'completed',
  Failed = 'failed',
}

@Schema({ _id: false })
export class UploadChannelEntry {
  @Prop({ required: true })
  channel: string;

  @Prop({
    type: String,
    enum: Object.values(UploadChannelStatus),
    required: true,
    default: UploadChannelStatus.Pending,
  })
  status: UploadChannelStatus;

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

  @Prop({ required: true, index: true })
  contentRef: string;

  @Prop({ required: true, index: true })
  workflowRef: string;

  @Prop({ required: true, index: true })
  ruleRef: string;

  /** True when at least one channel is scheduled for a future time. */
  @Prop({ type: Boolean, required: true, default: false, index: true })
  hasScheduled: boolean;

  /** Earliest pending/scheduled publish time across channels; null if none. */
  @Prop({ type: Date, default: null, index: true })
  nextScheduledAt: Date | null;

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
export type UploadDocument = HydratedDocument<Upload>;

UploadSchema.index({ hasScheduled: 1, nextScheduledAt: 1 });
UploadSchema.index({ contentRef: 1, status: 1 });
