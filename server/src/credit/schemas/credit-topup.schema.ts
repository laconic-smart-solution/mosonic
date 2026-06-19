import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/** Audit trail of mock self-serve credit topups (no real payment yet). */
@Schema({ collection: 'credit_topups', timestamps: true })
export class CreditTopup {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true })
  packageId: string;

  @Prop({ required: true })
  credits: number;

  @Prop({ required: true })
  priceUsd: number;
}

export const CreditTopupSchema = SchemaFactory.createForClass(CreditTopup);
export type CreditTopupDocument = HydratedDocument<CreditTopup>;

CreditTopupSchema.index({ userId: 1, createdAt: -1 });
