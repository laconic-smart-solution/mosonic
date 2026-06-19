import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CreditTopupSource = 'self_serve' | 'admin';

/** Audit trail of credit topups (self-serve packages or admin manual grants). */
@Schema({ collection: 'credit_topups', timestamps: true })
export class CreditTopup {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: false })
  packageId?: string;

  @Prop({ required: true })
  credits: number;

  @Prop({ required: true, default: 0 })
  priceUsd: number;

  @Prop({ required: true, enum: ['self_serve', 'admin'], default: 'self_serve' })
  source: CreditTopupSource;

  @Prop({ required: false, index: true })
  adminUserId?: string;

  @Prop({ required: false })
  reason?: string;
}

export const CreditTopupSchema = SchemaFactory.createForClass(CreditTopup);
export type CreditTopupDocument = HydratedDocument<CreditTopup>;

CreditTopupSchema.index({ userId: 1, createdAt: -1 });
