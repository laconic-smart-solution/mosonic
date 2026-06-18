import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ collection: 'credit_ledger', timestamps: true })
export class CreditLedger {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true, index: true })
  pipelineRef: string;

  @Prop({ type: String })
  campaignRef?: string;

  @Prop({ type: String })
  contentRef?: string;

  @Prop({ required: true })
  nodeId: string;

  @Prop({ required: true })
  nodeType: string;

  @Prop({ required: true })
  provider: string;

  @Prop({ required: true, default: '' })
  model: string;

  @Prop({ required: true })
  rawCostUsd: number;

  @Prop({ required: true })
  overheadUsd: number;

  @Prop({ required: true })
  marginAppliedUsd: number;

  @Prop({ required: true })
  creditPriceUsdSnapshot: number;

  @Prop({ required: true })
  creditsCharged: number;

  @Prop({ required: true, index: true })
  billingPeriod: Date;
}

export const CreditLedgerSchema = SchemaFactory.createForClass(CreditLedger);
export type CreditLedgerDocument = HydratedDocument<CreditLedger>;

CreditLedgerSchema.index({ userId: 1, billingPeriod: 1 });
CreditLedgerSchema.index({ userId: 1, createdAt: -1 });
CreditLedgerSchema.index({ pipelineRef: 1 });
