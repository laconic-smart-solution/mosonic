import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { randomUUID } from 'node:crypto';

export enum ContentPromptStrategy {
  Fixed = 'fixed',
  Rotate = 'rotate',
  AiCalendar = 'ai_calendar',
}

@Schema({ collection: 'campaign_schedules', timestamps: true })
export class CampaignSchedule {
  @Prop({
    type: String,
    required: true,
    unique: true,
    default: () => randomUUID(),
  })
  scheduleId: string;

  @Prop({ type: String, required: true, index: true })
  userId: string;

  @Prop({ type: String, required: true, index: true })
  ruleRef: string;

  @Prop({ type: String, default: null })
  workflowTemplateId: string | null;

  @Prop({ type: String, default: null })
  workflowRef: string | null;

  @Prop({
    type: String,
    enum: Object.values(ContentPromptStrategy),
    default: ContentPromptStrategy.Fixed,
  })
  contentPromptStrategy: ContentPromptStrategy;

  @Prop({ type: [String], default: [] })
  contentPrompts: string[];

  @Prop({ type: String, default: 'UTC' })
  timezone: string;

  @Prop({ type: Boolean, default: true })
  enabled: boolean;

  @Prop({ type: Date, required: true, index: true })
  nextRunAt: Date;

  @Prop({ type: Date, default: null })
  lastRunAt: Date | null;

  @Prop({ type: String, default: null })
  lastPipelineId: string | null;

  @Prop({ type: Number, default: 0 })
  failureCount: number;
}

export const CampaignScheduleSchema =
  SchemaFactory.createForClass(CampaignSchedule);
export type CampaignScheduleDocument = HydratedDocument<CampaignSchedule>;

CampaignScheduleSchema.index({ enabled: 1, nextRunAt: 1 });
