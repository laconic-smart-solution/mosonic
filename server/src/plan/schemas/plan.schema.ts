import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { randomUUID } from 'node:crypto';

@Schema({ collection: 'plans', timestamps: true })
export class Plan {
  @Prop({
    type: String,
    required: true,
    unique: true,
    default: () => randomUUID(),
  })
  planId: string;

  @Prop({ required: true, index: true })
  name: string;

  @Prop({ required: true })
  priceThb: number;

  @Prop({ required: true })
  priceUsd: number;

  /** @deprecated v2 derives credits from priceUsd / creditPriceUsd at read time. */
  @Prop()
  creditsPerMonth?: number;

  /**
   * Explicit monthly credit allowance. When set, overrides the
   * priceUsd / creditPriceUsd derivation (used for the free plan).
   */
  @Prop({ type: Number, default: null })
  creditsOverride?: number | null;

  @Prop({ required: true, default: true, index: true })
  isActive: boolean;

  @Prop({ type: String })
  description?: string;

  @Prop({ type: [String], default: [] })
  features: string[];
}

export const PlanSchema = SchemaFactory.createForClass(Plan);
export type PlanDocument = HydratedDocument<Plan>;
