import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { randomUUID } from 'node:crypto';

@Schema({ _id: false })
export class NewsTriggerLogDetail {
  @Prop({ type: String, required: true })
  ruleId: string;

  @Prop({ type: String, required: true })
  userId: string;

  @Prop({ type: String, required: true })
  articleTitle: string;

  @Prop({ type: Number })
  relevanceScore?: number;

  @Prop({ type: String })
  pipelineId?: string;

  @Prop({ type: Boolean, required: true })
  triggered: boolean;

  @Prop({ type: String })
  skipReason?: string;
}
export const NewsTriggerLogDetailSchema =
  SchemaFactory.createForClass(NewsTriggerLogDetail);

@Schema({ collection: 'news_trigger_logs', timestamps: true })
export class NewsTriggerLog {
  @Prop({ type: String, required: true, default: () => randomUUID() })
  runId: string;

  @Prop({ type: String, required: true })
  group: string;

  /** Set for manual runs to simplify latest-run queries. */
  @Prop({ type: String, default: null })
  ruleId: string | null;

  @Prop({ type: Date, required: true })
  ranAt: Date;

  @Prop({ type: Date, default: null })
  completedAt: Date | null;

  @Prop({ type: Number, default: 0 })
  articlesFetched: number;

  @Prop({ type: Number, default: 0 })
  topArticlesPicked: number;

  @Prop({ type: Number, default: 0 })
  rulesChecked: number;

  @Prop({ type: Number, default: 0 })
  rulesMatched: number;

  @Prop({ type: Number, default: 0 })
  pipelinesTriggered: number;

  @Prop({ type: [NewsTriggerLogDetailSchema], default: [] })
  details: NewsTriggerLogDetail[];

  @Prop({ type: String, default: null })
  errorMessage: string | null;
}

export const NewsTriggerLogSchema =
  SchemaFactory.createForClass(NewsTriggerLog);
export type NewsTriggerLogDocument = HydratedDocument<NewsTriggerLog>;
