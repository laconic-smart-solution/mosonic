import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { randomUUID } from 'node:crypto';

@Schema({ collection: 'fixed_costs', timestamps: true })
export class FixedCost {
  @Prop({
    type: String,
    required: true,
    unique: true,
    default: () => randomUUID(),
  })
  fixedCostId: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  amountUsd: number;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const FixedCostSchema = SchemaFactory.createForClass(FixedCost);
export type FixedCostDocument = HydratedDocument<FixedCost>;
