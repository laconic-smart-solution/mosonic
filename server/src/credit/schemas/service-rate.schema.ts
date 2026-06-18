import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { randomUUID } from 'node:crypto';

export type ServiceRateType = 'text' | 'image' | 'video';

@Schema({ collection: 'service_rates', timestamps: true })
export class ServiceRate {
  @Prop({
    type: String,
    required: true,
    unique: true,
    default: () => randomUUID(),
  })
  serviceRateId: string;

  @Prop({ required: true, enum: ['text', 'image', 'video'] })
  serviceType: ServiceRateType;

  @Prop({ required: true })
  provider: string;

  @Prop({ required: true })
  model: string;

  @Prop()
  avgPricePerCall?: number;

  @Prop()
  pricePerImage?: number;

  @Prop()
  pricePerSecond?: number;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const ServiceRateSchema = SchemaFactory.createForClass(ServiceRate);
export type ServiceRateDocument = HydratedDocument<ServiceRate>;

ServiceRateSchema.index(
  { serviceType: 1, provider: 1, model: 1 },
  { unique: true },
);
