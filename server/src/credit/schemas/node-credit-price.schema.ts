import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { randomUUID } from 'node:crypto';

@Schema({ collection: 'node_credit_prices', timestamps: true })
export class NodeCreditPrice {
  @Prop({
    type: String,
    required: true,
    unique: true,
    default: () => randomUUID(),
  })
  nodeCreditPriceId: string;

  @Prop({ required: true, unique: true })
  nodeType: string;

  @Prop({ required: true, min: 0.000001 })
  costUsd: number;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const NodeCreditPriceSchema =
  SchemaFactory.createForClass(NodeCreditPrice);
export type NodeCreditPriceDocument = HydratedDocument<NodeCreditPrice>;

NodeCreditPriceSchema.index({ nodeType: 1 }, { unique: true });
