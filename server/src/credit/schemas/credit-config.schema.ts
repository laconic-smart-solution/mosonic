import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ _id: false })
export class CreditConfigHistoryEntry {
  @Prop({ required: true })
  creditPriceUsd: number;

  @Prop({ required: true })
  marginTarget: number;

  @Prop({ required: true })
  basicUsersPerMonth: number;

  @Prop({ required: true })
  overheadFactor: number;

  @Prop({ required: true })
  changedAt: Date;

  @Prop({ required: true })
  changedBy: string;
}
export const CreditConfigHistoryEntrySchema =
  SchemaFactory.createForClass(CreditConfigHistoryEntry);

@Schema({ collection: 'credit_config', timestamps: true })
export class CreditConfig {
  @Prop({ required: true, unique: true, default: 'default' })
  singletonKey: string;

  /** Fixed retail price per 1 credit (default $0.01). */
  @Prop({ required: true, default: 0.01 })
  creditPriceUsd: number;

  /** Per-operation margin dial applied in calculateCredits(). */
  @Prop({ required: true, default: 3.0 })
  marginTarget: number;

  /** Expected basic-tier users for overhead amortization. */
  @Prop({ required: true, default: 50 })
  basicUsersPerMonth: number;

  /** Cached: totalFixed / (basicUsers × basicPlanCredits × creditPriceUsd). */
  @Prop({ required: true, default: 0 })
  overheadFactor: number;

  /** Monitoring: creditPriceUsd / costPerCredit (read-only metric). */
  @Prop({ required: true, default: 0 })
  derivedMargin: number;

  @Prop({ type: [CreditConfigHistoryEntrySchema], default: [] })
  changeHistory: CreditConfigHistoryEntry[];
}

export const CreditConfigSchema = SchemaFactory.createForClass(CreditConfig);
export type CreditConfigDocument = HydratedDocument<CreditConfig>;
