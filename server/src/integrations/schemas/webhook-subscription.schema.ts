import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { randomUUID } from 'node:crypto';

@Schema({ collection: 'webhook_subscriptions', timestamps: true })
export class WebhookSubscription {
  @Prop({
    type: String,
    required: true,
    unique: true,
    default: () => randomUUID(),
  })
  subscriptionId: string;

  @Prop({ type: String, required: true, index: true })
  userId: string;

  @Prop({ type: String, required: true })
  url: string;

  @Prop({ type: String, required: true })
  secret: string;

  @Prop({ type: [String], default: [] })
  events: string[];

  @Prop({ type: Boolean, default: true })
  enabled: boolean;
}

export const WebhookSubscriptionSchema = SchemaFactory.createForClass(
  WebhookSubscription,
);
export type WebhookSubscriptionDocument =
  HydratedDocument<WebhookSubscription>;

@Schema({ collection: 'webhook_deliveries', timestamps: true })
export class WebhookDelivery {
  @Prop({
    type: String,
    required: true,
    unique: true,
    default: () => randomUUID(),
  })
  deliveryId: string;

  @Prop({ type: String, required: true, index: true })
  subscriptionId: string;

  @Prop({ type: String, required: true })
  event: string;

  @Prop({ type: Object, required: true })
  payload: Record<string, unknown>;

  @Prop({ type: Number, default: 0 })
  attempts: number;

  @Prop({ type: Number, default: null })
  lastStatusCode: number | null;

  @Prop({ type: String, default: null })
  lastError: string | null;

  @Prop({ type: Date, default: null })
  deliveredAt: Date | null;
}

export const WebhookDeliverySchema =
  SchemaFactory.createForClass(WebhookDelivery);
export type WebhookDeliveryDocument = HydratedDocument<WebhookDelivery>;
