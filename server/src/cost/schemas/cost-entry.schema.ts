import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CostEntryType =
  | 'openai_llm'
  | 'openai_image'
  | 'openai_video'
  | 'zernio_account';

export const COST_ENTRY_TYPES: CostEntryType[] = [
  'openai_llm',
  'openai_image',
  'openai_video',
  'zernio_account',
];

@Schema({ collection: 'cost_entries', timestamps: true })
export class CostEntry {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true, index: true })
  pipelineRef: string;

  /** Rule id (semantic "campaign" for this product). */
  @Prop({ required: true, index: true })
  campaignRef: string;

  @Prop({ type: String })
  contentRef?: string;

  @Prop({ type: String })
  nodeId?: string;

  @Prop({ type: String })
  nodeType?: string;

  @Prop({ required: true })
  provider: string;

  @Prop({ type: String })
  providerModel?: string;

  @Prop({
    required: true,
    type: String,
    enum: COST_ENTRY_TYPES,
  })
  entryType: CostEntryType;

  @Prop({ type: Number, default: 0 })
  inputTokens: number;

  @Prop({ type: Number, default: 0 })
  outputTokens: number;

  @Prop({ type: Number, default: 0 })
  totalTokens: number;

  @Prop({ type: Number, default: 0 })
  imageCount: number;

  @Prop({ type: String })
  imageSize?: string;

  @Prop({ type: String })
  imageQuality?: string;

  @Prop({ type: Number, default: 0 })
  videoSeconds: number;

  @Prop({ type: String })
  videoResolution?: string;

  @Prop({ type: Number, default: 0 })
  accountCount: number;

  @Prop({ required: true })
  costUsd: number;

  @Prop({ required: true, index: true })
  billingPeriod: Date;
}

export const CostEntrySchema = SchemaFactory.createForClass(CostEntry);
export type CostEntryDocument = HydratedDocument<CostEntry>;

CostEntrySchema.index({ userId: 1, billingPeriod: 1 });
CostEntrySchema.index({ userId: 1, pipelineRef: 1 });
CostEntrySchema.index({ userId: 1, campaignRef: 1 });
