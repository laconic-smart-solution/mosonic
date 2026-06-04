import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { randomUUID } from 'node:crypto';

export enum AutonomyMode {
  Off = 'off',
  ReviewOptional = 'review_optional',
  FullAuto = 'full_auto',
}

@Schema({ _id: false })
export class QuietHours {
  @Prop({ type: String, required: true })
  start: string;

  @Prop({ type: String, required: true })
  end: string;

  @Prop({ type: String, default: 'UTC' })
  timezone: string;
}
export const QuietHoursSchema = SchemaFactory.createForClass(QuietHours);

@Schema({ collection: 'campaign_autonomy_policies', timestamps: true })
export class CampaignAutonomyPolicy {
  @Prop({
    type: String,
    required: true,
    unique: true,
    default: () => randomUUID(),
  })
  policyId: string;

  @Prop({ type: String, required: true, index: true })
  ruleRef: string;

  @Prop({ type: String, required: true, index: true })
  userId: string;

  @Prop({ type: Boolean, default: false })
  enabled: boolean;

  @Prop({
    type: String,
    enum: Object.values(AutonomyMode),
    default: AutonomyMode.Off,
  })
  mode: AutonomyMode;

  @Prop({ type: [String], default: [] })
  allowedChannels: string[];

  @Prop({ type: Number, default: 5 })
  maxPostsPerDay: number;

  @Prop({ type: QuietHoursSchema, default: null })
  quietHours: QuietHours | null;

  @Prop({ type: Boolean, default: true })
  blockIfPendingSuggestions: boolean;
}

export const CampaignAutonomyPolicySchema = SchemaFactory.createForClass(
  CampaignAutonomyPolicy,
);
export type CampaignAutonomyPolicyDocument =
  HydratedDocument<CampaignAutonomyPolicy>;

CampaignAutonomyPolicySchema.index({ ruleRef: 1 }, { unique: true });
